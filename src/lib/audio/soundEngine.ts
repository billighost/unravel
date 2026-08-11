/**
 * UNRAVEL PROCEDURAL AUDIO ENGINE
 *
 * 100% Web Audio API synthesis — zero audio files.
 *
 * Signal chain: every voice -> musicBus/fxBus -> compressor -> masterGain -> out,
 * with a parallel convolution reverb send. Routing everything through one
 * compressor is what stops a hundred simultaneous cube knocks from clipping into
 * a nasty digital crackle, and the shared reverb is what makes impacts sound like
 * they happen in a room rather than in a vacuum.
 *
 * Voices:
 *  - layered cube impacts (body thump + attack click + noise burst)
 *  - cluster mixing so N collisions in one frame become one rich hit
 *  - dispersal blast, revert riser, resolving revert chime
 *  - mechanical key clicks, brush noise texture, UI taps
 *  - disturbance-driven ambient drone
 */

type ImpactCharacter = 'knock' | 'scrape';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private fxBus: GainNode | null = null;
  private reverbSend: GainNode | null = null;
  private isMuted: boolean = false;
  private noiseBuffer: AudioBuffer | null = null;

  // Brush sound state
  private brushSource: AudioBufferSourceNode | null = null;
  private brushFilter: BiquadFilterNode | null = null;
  private brushGain: GainNode | null = null;
  private isBrushPlaying: boolean = false;

  // Ambient drone state
  private ambientOscA: OscillatorNode | null = null;
  private ambientOscB: OscillatorNode | null = null;
  private ambientFilter: BiquadFilterNode | null = null;
  private ambientGain: GainNode | null = null;
  private isAmbientPlaying: boolean = false;

  // Impact voice budget
  private activeImpactVoices: number = 0;
  private maxImpactVoices: number = 10;
  private lastImpactTime: number = 0;

  constructor() {
    if (typeof window === 'undefined') return;

    try {
      const storedMute = localStorage.getItem('unravel-muted');
      if (storedMute !== null) this.isMuted = storedMute === 'true';
    } catch (e) {}

    const handleFirstInteraction = () => {
      this.initContext();
      cleanup();
    };
    const cleanup = () => {
      window.removeEventListener('pointerdown', handleFirstInteraction);
      window.removeEventListener('touchstart', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
    };
    window.addEventListener('pointerdown', handleFirstInteraction, { passive: true });
    window.addEventListener('touchstart', handleFirstInteraction, { passive: true });
    window.addEventListener('keydown', handleFirstInteraction, { passive: true });
  }

  /** Lazily creates the graph and resumes the context on a user gesture. */
  public initContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;

    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return null;

      this.ctx = new AudioCtx();
      const ctx = this.ctx;

      this.masterGain = ctx.createGain();
      this.masterGain.gain.value = this.isMuted ? 0 : 0.9;
      this.masterGain.connect(ctx.destination);

      // Glue compressor: soaks up impact transients so dense collisions stay
      // punchy instead of clipping.
      this.compressor = ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -18;
      this.compressor.knee.value = 24;
      this.compressor.ratio.value = 8;
      this.compressor.attack.value = 0.003;
      this.compressor.release.value = 0.18;
      this.compressor.connect(this.masterGain);

      this.fxBus = ctx.createGain();
      this.fxBus.gain.value = 1;
      this.fxBus.connect(this.compressor);

      // Parallel reverb send gives impacts a sense of physical space.
      const convolver = ctx.createConvolver();
      convolver.buffer = this.createImpulseResponse(ctx, 1.1, 3.2);
      this.reverbSend = ctx.createGain();
      this.reverbSend.gain.value = 0.28;
      this.reverbSend.connect(convolver);
      convolver.connect(this.compressor);

      // Shared white-noise buffer for brush texture and impact transients.
      const bufferSize = Math.floor(ctx.sampleRate * 2);
      this.noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    return this.ctx;
  }

  /** Synthesises a decaying-noise impulse response for the reverb. */
  private createImpulseResponse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
    const rate = ctx.sampleRate;
    const length = Math.max(1, Math.floor(rate * seconds));
    const impulse = ctx.createBuffer(2, length, rate);

    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        const envelope = Math.pow(1 - i / length, decay);
        data[i] = (Math.random() * 2 - 1) * envelope;
      }
    }
    return impulse;
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    try {
      localStorage.setItem('unravel-muted', String(muted));
    } catch (e) {}
    if (this.masterGain && this.ctx) {
      const now = this.ctx.currentTime;
      // Ramp rather than jump — an instant gain change clicks audibly.
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
      this.masterGain.gain.linearRampToValueAtTime(muted ? 0 : 0.9, now + 0.06);
    }
  }

  public toggleMute(): boolean {
    this.setMuted(!this.isMuted);
    return this.isMuted;
  }

  /** Tracks a voice against the polyphony budget and auto-frees it. */
  private claimVoice(durationSeconds: number): boolean {
    if (this.activeImpactVoices >= this.maxImpactVoices) return false;
    this.activeImpactVoices++;
    setTimeout(() => {
      this.activeImpactVoices = Math.max(0, this.activeImpactVoices - 1);
    }, durationSeconds * 1000 + 40);
    return true;
  }

  /** Routes a voice through the fx bus and the reverb send. */
  private connectVoice(node: AudioNode, reverbAmount: number = 1): void {
    if (!this.fxBus) return;
    node.connect(this.fxBus);
    if (this.reverbSend && reverbAmount > 0 && this.ctx) {
      const sendGain = this.ctx.createGain();
      sendGain.gain.value = reverbAmount;
      node.connect(sendGain);
      sendGain.connect(this.reverbSend);
    }
  }

  // ==========================================
  // CUBE IMPACTS
  // ==========================================

  /**
   * One mixed impact for a whole frame's worth of collisions.
   *
   * `count` drives density (more cubes hitting = fuller, louder, lower) and
   * `peakMagnitude` drives brightness and pitch. Mixing per-frame rather than
   * per-collision is what turns a machine-gun rattle into a single satisfying
   * crunch.
   */
  public playCubeCluster(count: number, peakMagnitude: number, character: ImpactCharacter = 'knock'): void {
    const ctx = this.initContext();
    if (!ctx || !this.fxBus) return;

    const now = ctx.currentTime;
    // Rate limit so a sustained collision cascade doesn't stack voices.
    if (now - this.lastImpactTime < 0.028) return;
    this.lastImpactTime = now;

    const intensity = Math.min(Math.max(peakMagnitude / 6, 0), 1);
    const density = Math.min(count / 24, 1);
    const duration = character === 'scrape' ? 0.16 : 0.13;

    if (!this.claimVoice(duration)) return;

    const level = (0.1 + intensity * 0.45) * (0.65 + density * 0.35);

    // Layer 1 — body. Pitch-dropping sine gives the "thunk" weight. Bigger
    // pile-ups ring lower, which reads as mass.
    const bodyFreq = (character === 'scrape' ? 150 : 210) * (1.25 - density * 0.4) + intensity * 90;
    const body = ctx.createOscillator();
    const bodyGain = ctx.createGain();
    body.type = 'sine';
    body.frequency.setValueAtTime(bodyFreq, now);
    body.frequency.exponentialRampToValueAtTime(Math.max(bodyFreq * 0.35, 40), now + duration);
    bodyGain.gain.setValueAtTime(0, now);
    bodyGain.gain.linearRampToValueAtTime(level, now + 0.004);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    body.connect(bodyGain);
    this.connectVoice(bodyGain, 0.5);
    body.start(now);
    body.stop(now + duration + 0.02);

    // Layer 2 — attack click. A short triangle burst supplies the hard edge
    // that makes the hit feel like a solid object rather than a soft blob.
    const click = ctx.createOscillator();
    const clickGain = ctx.createGain();
    click.type = 'triangle';
    const clickFreq = 620 + intensity * 900 + (Math.random() - 0.5) * 120;
    click.frequency.setValueAtTime(clickFreq, now);
    click.frequency.exponentialRampToValueAtTime(clickFreq * 0.45, now + 0.03);
    clickGain.gain.setValueAtTime(0, now);
    clickGain.gain.linearRampToValueAtTime(level * 0.5, now + 0.002);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);
    click.connect(clickGain);
    this.connectVoice(clickGain, 0.3);
    click.start(now);
    click.stop(now + 0.05);

    // Layer 3 — noise burst. Bandpassed noise supplies the grit of block on
    // block; scrapes get a wider, longer, brighter band than knocks.
    if (this.noiseBuffer) {
      const noise = ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      noise.loop = true;

      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.setValueAtTime(
        character === 'scrape' ? 1700 + intensity * 2200 : 900 + intensity * 1500,
        now
      );
      noiseFilter.Q.value = character === 'scrape' ? 0.8 : 1.8;

      const noiseGain = ctx.createGain();
      const noiseLevel = level * (character === 'scrape' ? 0.55 : 0.34);
      const noiseDur = character === 'scrape' ? 0.12 : 0.055;
      noiseGain.gain.setValueAtTime(0, now);
      noiseGain.gain.linearRampToValueAtTime(noiseLevel, now + 0.003);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + noiseDur);

      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      this.connectVoice(noiseGain, 0.45);
      noise.start(now, Math.random() * 1.5);
      noise.stop(now + noiseDur + 0.02);
    }
  }

  /** Backwards-compatible single knock. */
  public playCubeKnock(speed: number): void {
    this.playCubeCluster(1, speed, 'knock');
  }

  /**
   * Big low blast for the Disperse action — a filtered noise sweep over a
   * sub-bass drop, so the whole picture exploding actually lands.
   */
  public playDisperseBlast(): void {
    const ctx = this.initContext();
    if (!ctx || !this.fxBus || !this.noiseBuffer) return;

    const now = ctx.currentTime;
    const duration = 0.85;

    // Sub-bass drop supplies the chest-thump.
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(150, now);
    sub.frequency.exponentialRampToValueAtTime(32, now + 0.5);
    subGain.gain.setValueAtTime(0, now);
    subGain.gain.linearRampToValueAtTime(0.7, now + 0.01);
    subGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
    sub.connect(subGain);
    this.connectVoice(subGain, 0.4);
    sub.start(now);
    sub.stop(now + 0.6);

    // Noise sweep: opens bright then closes down, reading as debris scattering.
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    noise.loop = true;

    const sweep = ctx.createBiquadFilter();
    sweep.type = 'lowpass';
    sweep.frequency.setValueAtTime(6500, now);
    sweep.frequency.exponentialRampToValueAtTime(320, now + duration);
    sweep.Q.value = 1.2;

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0, now);
    noiseGain.gain.linearRampToValueAtTime(0.4, now + 0.015);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    noise.connect(sweep);
    sweep.connect(noiseGain);
    this.connectVoice(noiseGain, 0.9);
    noise.start(now);
    noise.stop(now + duration + 0.05);
  }

  /**
   * Rising whoosh that plays as the revert begins, so reassembly feels
   * deliberate and anticipated rather than arbitrary.
   */
  public playRevertStart(): void {
    const ctx = this.initContext();
    if (!ctx || !this.fxBus || !this.noiseBuffer) return;

    const now = ctx.currentTime;
    const duration = 0.6;

    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    noise.loop = true;

    const riser = ctx.createBiquadFilter();
    riser.type = 'bandpass';
    riser.frequency.setValueAtTime(320, now);
    riser.frequency.exponentialRampToValueAtTime(3600, now + duration);
    riser.Q.value = 3.5;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.16, now + duration * 0.75);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    noise.connect(riser);
    riser.connect(gain);
    this.connectVoice(gain, 0.7);
    noise.start(now);
    noise.stop(now + duration + 0.05);
  }

  // ==========================================
  // AMBIENT DISTURBANCE DRONE
  // ==========================================

  public startAmbientDrone(): void {
    const ctx = this.initContext();
    if (!ctx || !this.fxBus || this.isAmbientPlaying) return;

    try {
      // Two slightly detuned oscillators beat against each other, which is far
      // warmer than the single static tone this replaced.
      this.ambientOscA = ctx.createOscillator();
      this.ambientOscA.type = 'triangle';
      this.ambientOscA.frequency.setValueAtTime(55, ctx.currentTime);

      this.ambientOscB = ctx.createOscillator();
      this.ambientOscB.type = 'sine';
      this.ambientOscB.frequency.setValueAtTime(55 * 1.006, ctx.currentTime);

      this.ambientFilter = ctx.createBiquadFilter();
      this.ambientFilter.type = 'lowpass';
      this.ambientFilter.frequency.setValueAtTime(90, ctx.currentTime);
      this.ambientFilter.Q.value = 0.9;

      this.ambientGain = ctx.createGain();
      this.ambientGain.gain.setValueAtTime(0.0001, ctx.currentTime);
      this.ambientGain.gain.linearRampToValueAtTime(0.02, ctx.currentTime + 0.4);

      this.ambientOscA.connect(this.ambientFilter);
      this.ambientOscB.connect(this.ambientFilter);
      this.ambientFilter.connect(this.ambientGain);
      this.ambientGain.connect(this.fxBus);

      this.ambientOscA.start();
      this.ambientOscB.start();
      this.isAmbientPlaying = true;
    } catch (e) {
      console.warn('Failed to start ambient drone', e);
    }
  }

  public updateAmbientDisturbance(disturbanceLevel: number): void {
    const ctx = this.initContext();
    if (!ctx || !this.fxBus) return;

    if (!this.isAmbientPlaying) {
      this.startAmbientDrone();
    }
    if (!this.ambientFilter || !this.ambientGain) return;

    const level = Math.min(Math.max(disturbanceLevel, 0), 1);
    const now = ctx.currentTime;

    const targetFreq = 90 + level * 420;
    const targetGain = 0.018 + level * 0.055;

    this.ambientFilter.frequency.linearRampToValueAtTime(targetFreq, now + 0.15);
    this.ambientGain.gain.linearRampToValueAtTime(targetGain, now + 0.15);
  }

  public stopAmbientDrone(): void {
    if (!this.isAmbientPlaying || !this.ctx || !this.ambientGain) return;

    const now = this.ctx.currentTime;
    const oscA = this.ambientOscA;
    const oscB = this.ambientOscB;
    const gain = this.ambientGain;

    // Capture the nodes now and null the fields immediately, so a restart
    // during the fade builds a fresh voice instead of adopting a dying one.
    this.ambientOscA = null;
    this.ambientOscB = null;
    this.ambientFilter = null;
    this.ambientGain = null;
    this.isAmbientPlaying = false;

    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(0.0001, now + 0.25);

    setTimeout(() => {
      [oscA, oscB].forEach((osc) => {
        if (!osc) return;
        try {
          osc.stop();
          osc.disconnect();
        } catch (e) {}
      });
      try {
        gain.disconnect();
      } catch (e) {}
    }, 300);
  }

  // ==========================================
  // BRUSH STROKE SOUND (Draw Mode)
  // ==========================================

  public startBrush(): void {
    const ctx = this.initContext();
    if (!ctx || !this.fxBus || !this.noiseBuffer || this.isBrushPlaying) return;

    try {
      this.stopBrushImmediate();

      this.brushSource = ctx.createBufferSource();
      this.brushSource.buffer = this.noiseBuffer;
      this.brushSource.loop = true;

      this.brushFilter = ctx.createBiquadFilter();
      this.brushFilter.type = 'bandpass';
      this.brushFilter.frequency.setValueAtTime(400, ctx.currentTime);
      this.brushFilter.Q.setValueAtTime(1.5, ctx.currentTime);

      this.brushGain = ctx.createGain();
      // Fade in from silence; starting at a nonzero gain pops.
      this.brushGain.gain.setValueAtTime(0.0001, ctx.currentTime);
      this.brushGain.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 0.03);

      this.brushSource.connect(this.brushFilter);
      this.brushFilter.connect(this.brushGain);
      this.brushGain.connect(this.fxBus);

      this.brushSource.start();
      this.isBrushPlaying = true;
    } catch (e) {
      console.warn('Failed to start brush audio', e);
    }
  }

  public updateBrushVelocity(speedPxPerSec: number): void {
    if (!this.isBrushPlaying || !this.ctx || !this.brushFilter || !this.brushGain) return;

    const now = this.ctx.currentTime;
    const normSpeed = Math.min(Math.max(speedPxPerSec / 1200, 0), 1);

    this.brushFilter.frequency.linearRampToValueAtTime(300 + normSpeed * 1900, now + 0.05);
    this.brushGain.gain.linearRampToValueAtTime(0.04 + normSpeed * 0.2, now + 0.05);
  }

  public stopBrush(): void {
    if (!this.isBrushPlaying || !this.ctx || !this.brushGain) return;

    const now = this.ctx.currentTime;
    const fadeDuration = 0.1;

    this.brushGain.gain.cancelScheduledValues(now);
    this.brushGain.gain.setValueAtTime(this.brushGain.gain.value, now);
    this.brushGain.gain.linearRampToValueAtTime(0.0001, now + fadeDuration);
    this.isBrushPlaying = false;

    setTimeout(() => this.stopBrushImmediate(), fadeDuration * 1000 + 30);
  }

  private stopBrushImmediate(): void {
    if (this.brushSource) {
      try {
        this.brushSource.stop();
        this.brushSource.disconnect();
      } catch (e) {}
      this.brushSource = null;
    }
    if (this.brushFilter) {
      this.brushFilter.disconnect();
      this.brushFilter = null;
    }
    if (this.brushGain) {
      this.brushGain.disconnect();
      this.brushGain = null;
    }
    this.isBrushPlaying = false;
  }

  // ==========================================
  // TYPING SOUND (Type Mode)
  // ==========================================

  /**
   * Mechanical key click: a pitched body plus a noise transient, so it reads as
   * a real switch rather than a beep.
   */
  public playTypeClick(): void {
    const ctx = this.initContext();
    if (!ctx || !this.fxBus) return;

    const now = ctx.currentTime;
    const pitchVariation = 0.9 + Math.random() * 0.2;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(340 * pitchVariation, now);
    osc.frequency.exponentialRampToValueAtTime(95 * pitchVariation, now + 0.03);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.038);
    osc.connect(gain);
    this.connectVoice(gain, 0.16);
    osc.start(now);
    osc.stop(now + 0.05);

    if (this.noiseBuffer) {
      const noise = ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 2600;
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.09, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.02);
      noise.connect(hp);
      hp.connect(noiseGain);
      this.connectVoice(noiseGain, 0.1);
      noise.start(now, Math.random() * 1.5);
      noise.stop(now + 0.03);
    }
  }

  // ==========================================
  // REVERT COMPLETION CHIME
  // ==========================================

  /** Resolving major triad — the payoff when the picture snaps back together. */
  public playRevertComplete(): void {
    const ctx = this.initContext();
    if (!ctx || !this.fxBus) return;

    const now = ctx.currentTime;
    // E5 / B5 / E6 arpeggiated slightly for a sense of resolution.
    const notes = [
      { freq: 659.25, delay: 0, level: 0.2 },
      { freq: 987.77, delay: 0.05, level: 0.16 },
      { freq: 1318.5, delay: 0.1, level: 0.12 },
    ];

    for (const note of notes) {
      const start = now + note.delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(note.freq, start);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(note.level, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.7);
      osc.connect(gain);
      this.connectVoice(gain, 1.0);
      osc.start(start);
      osc.stop(start + 0.75);
    }
  }

  // ==========================================
  // UI INTERACTION SOUNDS
  // ==========================================

  public playUIClick(): void {
    const ctx = this.initContext();
    if (!ctx || !this.fxBus) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(240, now);
    osc.frequency.exponentialRampToValueAtTime(70, now + 0.04);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.22, now + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);
    osc.connect(gain);
    this.connectVoice(gain, 0.2);
    osc.start(now);
    osc.stop(now + 0.055);
  }

  public playUIClickQuiet(): void {
    const ctx = this.initContext();
    if (!ctx || !this.fxBus) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(360, now);
    osc.frequency.exponentialRampToValueAtTime(130, now + 0.025);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.07, now + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.028);
    osc.connect(gain);
    this.connectVoice(gain, 0.1);
    osc.start(now);
    osc.stop(now + 0.035);
  }

  public playUnmuteBlip(): void {
    const ctx = this.initContext();
    if (!ctx || !this.fxBus) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(790, now + 0.05);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.11, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
    osc.connect(gain);
    this.connectVoice(gain, 0.35);
    osc.start(now);
    osc.stop(now + 0.07);
  }

  public playSuccessChime(): void {
    const ctx = this.initContext();
    if (!ctx || !this.fxBus) return;

    const now = ctx.currentTime;
    // A5 -> E6 as two overlapping voices; the old version retriggered one
    // oscillator's frequency, which produced an audible zipper instead of a chime.
    const notes = [
      { freq: 880, delay: 0, level: 0.16 },
      { freq: 1318.5, delay: 0.07, level: 0.13 },
    ];

    for (const note of notes) {
      const start = now + note.delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(note.freq, start);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(note.level, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.32);
      osc.connect(gain);
      this.connectVoice(gain, 0.6);
      osc.start(start);
      osc.stop(start + 0.35);
    }
  }
}

export const soundEngine = new SoundEngine();
