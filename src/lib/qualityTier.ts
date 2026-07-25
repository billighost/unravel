/**
 * UNRAVEL ADAPTIVE QUALITY TIER SYSTEM
 * 
 * Automatically detects device capabilities via hardware signals and a 1.5s runtime frame-rate probe.
 * Drives adaptive rendering resolution (pixelRatio), shadow maps, particle pool sizes, physics rest thresholds,
 * and downsampling grid limits to guarantee 60fps responsiveness on low-end devices.
 */

export type QualityTier = 'high' | 'medium' | 'low';

export interface QualityConfig {
  tier: QualityTier;
  maxPixelRatio: number;
  antialias: boolean;
  shadows: boolean;
  gridResolutionMax: number;
  gridResolutionDraw: number;
  gridResolutionType: number;
  particlePoolSize: number;
  particleMaxSpawnsPerFrame: number;
  restSpeedThreshold: number;
  transcodeFallbackAllowed: boolean;
}

const TIER_CONFIGS: Record<QualityTier, QualityConfig> = {
  high: {
    tier: 'high',
    maxPixelRatio: 2.5,
    antialias: true,
    shadows: true,
    gridResolutionMax: 160,
    gridResolutionDraw: 100,
    gridResolutionType: 90,
    particlePoolSize: 150,
    particleMaxSpawnsPerFrame: 4,
    restSpeedThreshold: 0.02,
    transcodeFallbackAllowed: true,
  },
  medium: {
    tier: 'medium',
    maxPixelRatio: 1.75,
    antialias: true,
    shadows: false,
    gridResolutionMax: 100,
    gridResolutionDraw: 75,
    gridResolutionType: 65,
    particlePoolSize: 80,
    particleMaxSpawnsPerFrame: 2,
    restSpeedThreshold: 0.04,
    transcodeFallbackAllowed: true,
  },
  low: {
    tier: 'low',
    maxPixelRatio: 1.0,
    antialias: false,
    shadows: false,
    gridResolutionMax: 60,
    gridResolutionDraw: 50,
    gridResolutionType: 45,
    particlePoolSize: 30,
    particleMaxSpawnsPerFrame: 1,
    restSpeedThreshold: 0.07,
    transcodeFallbackAllowed: false,
  },
};

class QualityTierManager {
  private currentTier: QualityTier = 'high';
  private isManual: boolean = false;
  private listeners: Set<(config: QualityConfig) => void> = new Set();
  private probeCompleted: boolean = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.currentTier = this.detectInitialTier();
    }
  }

  public getIsManual(): boolean {
    return this.isManual;
  }

  /**
   * Performs initial static capability inspection or loads saved manual choice.
   */
  private detectInitialTier(): QualityTier {
    // 1. Check if user set a manual performance override
    try {
      const manualChoice = localStorage.getItem('unravel_manual_quality_tier');
      if (manualChoice === 'high' || manualChoice === 'medium' || manualChoice === 'low') {
        this.isManual = true;
        this.probeCompleted = true; // Bypasses auto frame probe when manual choice exists
        return manualChoice;
      }

      // 2. Check if auto tier was saved from previous session frame probe
      const saved = localStorage.getItem('unravel_quality_tier');
      if (saved === 'high' || saved === 'medium' || saved === 'low') {
        return saved;
      }
    } catch (e) {}

    // 3. Hardware Concurrency & RAM inspection fallback
    const cores = navigator.hardwareConcurrency || 4;
    const ram = (navigator as any).deviceMemory || 4;
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    if (cores <= 2 || ram <= 2) {
      return 'low';
    } else if (cores <= 4 || ram <= 4 || isMobile) {
      return 'medium';
    }

    return 'high';
  }

  /**
   * Starts a 1.5-second runtime frame-rate probe during hero animation if not manually overridden.
   */
  public startFrameProbe() {
    if (typeof window === 'undefined' || this.probeCompleted || this.isManual) return;

    let frameTimes: number[] = [];
    let lastTime = performance.now();
    let startTime = lastTime;
    let animId: number;

    const measureFrame = (now: number) => {
      if (this.isManual) return;

      const delta = now - lastTime;
      lastTime = now;

      if (delta < 200) {
        frameTimes.push(delta);
      }

      if (now - startTime < 1500) {
        animId = requestAnimationFrame(measureFrame);
      } else {
        this.probeCompleted = true;
        if (frameTimes.length > 10) {
          const avgFrameTime = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
          let measuredTier: QualityTier = 'high';

          if (avgFrameTime > 26) {
            measuredTier = 'low';
          } else if (avgFrameTime > 19) {
            measuredTier = 'medium';
          }

          const tierPriority: Record<QualityTier, number> = { high: 3, medium: 2, low: 1 };
          if (tierPriority[measuredTier] < tierPriority[this.currentTier]) {
            this.setTier(measuredTier, false);
          }
        }
      }
    };

    animId = requestAnimationFrame(measureFrame);
  }

  public getTier(): QualityTier {
    return this.currentTier;
  }

  public getConfig(): QualityConfig {
    return TIER_CONFIGS[this.currentTier];
  }

  public setManualTier(tier: QualityTier) {
    this.isManual = true;
    this.probeCompleted = true;
    try {
      localStorage.setItem('unravel_manual_quality_tier', tier);
    } catch (e) {}
    this.setTier(tier, true);
  }

  public clearManualOverride() {
    this.isManual = false;
    this.probeCompleted = false;
    try {
      localStorage.removeItem('unravel_manual_quality_tier');
    } catch (e) {}
    
    // Fallback to initial auto detection and start frame probe
    const autoTier = this.detectInitialTier();
    this.setTier(autoTier, false);
    this.startFrameProbe();
  }

  public setTier(tier: QualityTier, isManualSetting: boolean = false) {
    if (this.currentTier !== tier || this.isManual !== isManualSetting) {
      this.currentTier = tier;
      if (!isManualSetting) {
        try {
          localStorage.setItem('unravel_quality_tier', tier);
        } catch (e) {}
      }

      const config = this.getConfig();
      this.listeners.forEach((listener) => listener(config));
    }
  }

  public subscribe(listener: (config: QualityConfig) => void): () => void {
    this.listeners.add(listener);
    listener(this.getConfig());
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export const qualityTierManager = new QualityTierManager();

