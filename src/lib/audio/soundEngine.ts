/**
 * UNRAVEL PROCEDURAL AUDIO ENGINE
 * 
 * 100% Web Audio API procedural synthesis — zero external audio files.
 * Includes:
 * - Lazy AudioContext initialization on first user interaction
 * - Master gain node & localStorage mute persistence
 * - Monophonic bandpass-filtered noise texture for Draw Mode brush strokes
 * - Polyphonic mechanical key click synthesizer for Type Mode
 * - Voice-pooled impact knock synthesizer for 3D physics collisions
 * - App-wide UI tap sound synthesizer
 * - Continuous ambient disturbance undertone drone
 * - Resolving dual-tone chime for Revert completion
 */

class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private isMuted: boolean = false;
  private noiseBuffer: AudioBuffer | null = null;

  // Brush sound state
  private brushSource: AudioBufferSourceNode | null = null;
  private brushFilter: BiquadFilterNode | null = null;
  private brushGain: GainNode | null = null;
  private isBrushPlaying: boolean = false;

  // Ambient sound state
  private ambientOsc: OscillatorNode | null = null;
  private ambientFilter: BiquadFilterNode | null = null;
  private ambientGain: GainNode | null = null;
  private isAmbientPlaying: boolean = false;

  // Voice Pool for Cube Impact Knocks
  private maxImpactVoices: number = 8;
  private activeImpactVoices: { node: OscillatorNode | AudioBufferSourceNode; gain: GainNode; startTime: number }[] = [];
  private frameImpactCount: number = 0;
  private maxImpactsPerFrame: number = 3;

  constructor() {
    if (typeof window !== 'undefined') {
      const storedMute = localStorage.getItem('unravel-muted');
      if (storedMute !== null) {
        this.isMuted = storedMute === 'true';
      }

      const handleFirstInteraction = () => {
        this.initContext();
        cleanup();
      };
      const cleanup = () => {
        window.removeEventListener('click', handleFirstInteraction);
        window.removeEventListener('pointerdown', handleFirstInteraction);
        window.removeEventListener('touchstart', handleFirstInteraction);
        window.removeEventListener('keydown', handleFirstInteraction);
      };
      window.addEventListener('click', handleFirstInteraction, { passive: true });
      window.addEventListener('pointerdown', handleFirstInteraction, { passive: true });
      window.addEventListener('touchstart', handleFirstInteraction, { passive: true });
      window.addEventListener('keydown', handleFirstInteraction, { passive: true });
    }
  }

  /**
   * Lazily initializes and resumes the AudioContext on user gesture.
   */
  public initContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;

    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return null;

      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.isMuted ? 0 : 1;
      this.masterGain.connect(this.ctx.destination);

      // Generate 2-second white noise buffer for brush texture
      const bufferSize = this.ctx.sampleRate * 2;
      this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }

      // Reset per-frame impact throttle counter
      const resetFrameCounter = () => {
        this.frameImpactCount = 0;
        requestAnimationFrame(resetFrameCounter);
      };
      requestAnimationFrame(resetFrameCounter);
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    return this.ctx;
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (typeof window !== 'undefined') {
      localStorage.setItem('unravel-muted', String(muted));
    }
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(muted ? 0 : 1, this.ctx.currentTime);
    }
  }

  public toggleMute(): boolean {
    this.setMuted(!this.isMuted);
    return this.isMuted;
  }

  // ==========================================
  // AMBIENT DISTURBANCE DRONE
  // ==========================================

  public startAmbientDrone(): void {
    const ctx = this.initContext();
    if (!ctx || !this.masterGain || this.isAmbientPlaying) return;

    try {
      this.ambientOsc = ctx.createOscillator();
      this.ambientOsc.type = 'triangle';
      this.ambientOsc.frequency.setValueAtTime(65, ctx.currentTime);

      this.ambientFilter = ctx.createBiquadFilter();
      this.ambientFilter.type = 'lowpass';
      this.ambientFilter.frequency.setValueAtTime(80, ctx.currentTime);

      this.ambientGain = ctx.createGain();
      this.ambientGain.gain.setValueAtTime(0.015, ctx.currentTime);

      this.ambientOsc.connect(this.ambientFilter);
      this.ambientFilter.connect(this.ambientGain);
      this.ambientGain.connect(this.masterGain);

      this.ambientOsc.start();
      this.isAmbientPlaying = true;
    } catch (e) {
      console.warn('Failed to start ambient drone', e);
    }
  }

  public updateAmbientDisturbance(disturbanceLevel: number): void {
    const ctx = this.initContext();
    if (!ctx || !this.masterGain) return;

    if (!this.isAmbientPlaying) {
      this.startAmbientDrone();
    }

    if (!this.ambientFilter || !this.ambientGain) return;

    const level = Math.min(Math.max(disturbanceLevel, 0), 1);
    const now = ctx.currentTime;

    const targetFreq = 80 + level * 340;
    const targetGain = 0.015 + level * 0.065;

    this.ambientFilter.frequency.linearRampToValueAtTime(targetFreq, now + 0.15);
    this.ambientGain.gain.linearRampToValueAtTime(targetGain, now + 0.15);
  }

  public stopAmbientDrone(): void {
    if (!this.isAmbientPlaying || !this.ctx || !this.ambientGain) return;
    const now = this.ctx.currentTime;
    this.ambientGain.gain.linearRampToValueAtTime(0.0001, now + 0.2);
    this.isAmbientPlaying = false;
    setTimeout(() => {
      if (this.ambientOsc) {
        try {
          this.ambientOsc.stop();
          this.ambientOsc.disconnect();
        } catch (e) {}
        this.ambientOsc = null;
      }
    }, 220);
  }

  // ==========================================
  // BRUSH STROKE SOUND (Draw Mode)
  // ==========================================

  public startBrush(): void {
    const ctx = this.initContext();
    if (!ctx || !this.masterGain || !this.noiseBuffer || this.isBrushPlaying) return;

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
      this.brushGain.gain.setValueAtTime(0.01, ctx.currentTime);

      this.brushSource.connect(this.brushFilter);
      this.brushFilter.connect(this.brushGain);
      this.brushGain.connect(this.masterGain);

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

    const targetFreq = 300 + normSpeed * 1900;
    const targetGain = 0.05 + normSpeed * 0.25;

    this.brushFilter.frequency.linearRampToValueAtTime(targetFreq, now + 0.05);
    this.brushGain.gain.linearRampToValueAtTime(targetGain, now + 0.05);
  }

  public stopBrush(): void {
    if (!this.isBrushPlaying || !this.ctx || !this.brushGain) return;

    const now = this.ctx.currentTime;
    const fadeDuration = 0.1;

    this.brushGain.gain.linearRampToValueAtTime(0.001, now + fadeDuration);
    this.isBrushPlaying = false;

    setTimeout(() => {
      this.stopBrushImmediate();
    }, fadeDuration * 1000 + 20);
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

  public playTypeClick(): void {
    const ctx = this.initContext();
    if (!ctx || !this.masterGain) return;

    const now = ctx.currentTime;
    const pitchVariation = 0.92 + Math.random() * 0.16;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(320 * pitchVariation, now);
    osc.frequency.exponentialRampToValueAtTime(80 * pitchVariation, now + 0.035);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.04);
  }

  // ==========================================
  // CUBE COLLISION / IMPACT SOUND
  // ==========================================

  public playCubeKnock(speed: number): void {
    const ctx = this.initContext();
    if (!ctx || !this.masterGain) return;

    if (this.frameImpactCount >= this.maxImpactsPerFrame) return;
    this.frameImpactCount++;

    const now = ctx.currentTime;
    this.activeImpactVoices = this.activeImpactVoices.filter(v => now - v.startTime < 0.1);

    if (this.activeImpactVoices.length >= this.maxImpactVoices) {
      const oldest = this.activeImpactVoices.shift();
      if (oldest) {
        try {
          oldest.gain.gain.setValueAtTime(0, now);
          oldest.node.stop();
        } catch (e) {}
      }
    }

    const normSpeed = Math.min(Math.max((speed - 0.5) / 8.0, 0), 1);
    const volume = 0.08 + normSpeed * 0.35;
    const baseFreq = 180 + normSpeed * 320 + (Math.random() - 0.5) * 40;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.4, now + 0.045);

    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.05);

    this.activeImpactVoices.push({ node: osc, gain, startTime: now });
  }

  // ==========================================
  // REVERT COMPLETION CHIME
  // ==========================================

  public playRevertComplete(): void {
    const ctx = this.initContext();
    if (!ctx || !this.masterGain) return;

    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'sine';
    osc2.type = 'sine';

    osc1.frequency.setValueAtTime(659.25, now); // E5
    osc2.frequency.setValueAtTime(987.77, now); // B5

    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.masterGain);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.35);
    osc2.stop(now + 0.35);
  }

  // ==========================================
  // UI INTERACTION SOUNDS (App-wide click)
  // ==========================================

  public playUIClick(): void {
    const ctx = this.initContext();
    if (!ctx || !this.masterGain) return;

    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.04);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.045);
  }

  /**
   * Lighter / quieter tap click variant for rapid or continuous controls (e.g., color picker dragging).
   */
  public playUIClickQuiet(): void {
    const ctx = this.initContext();
    if (!ctx || !this.masterGain) return;

    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(340, now);
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.025);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.03);
  }

  /**
   * Subtle, pleasant double-tone confirmation blip played ONLY on unmute.
   */
  public playUnmuteBlip(): void {
    const ctx = this.initContext();
    if (!ctx || !this.masterGain) return;

    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(780, now + 0.04);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.055);
  }

  /**
   * Short celebratory chime for confirmations (gallery shared, report sent, streak milestone).
   */
  public playSuccessChime(): void {
    const ctx = this.initContext();
    if (!ctx || !this.masterGain) return;

    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);        // A5
    osc.frequency.setValueAtTime(1318.5, now + 0.08); // E6

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.22);
  }
}

export const soundEngine = new SoundEngine();
