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

/**
 * Grid resolutions are deliberately coarse. Each cube carries its own tile of a
 * high-resolution artwork texture (see lib/cubeTexture.ts), so image quality no
 * longer depends on cube count — which frees us to use fewer, chunkier cubes.
 * Bigger cubes read better, feel more satisfying to smash, and leave far more
 * CPU headroom for real cube-vs-cube collision.
 */
const TIER_CONFIGS: Record<QualityTier, QualityConfig> = {
  high: {
    tier: 'high',
    maxPixelRatio: 2.5,
    antialias: true,
    shadows: true,
    // Fewer, bigger cubes = more satisfying to interact with.
    // Image quality is preserved by the per-cube tile texture pipeline
    // (cubeTexture.ts), so lower cube counts don't sacrifice detail.
    gridResolutionMax: 28,
    gridResolutionDraw: 28,
    gridResolutionType: 40,
    particlePoolSize: 220,
    particleMaxSpawnsPerFrame: 5,
    restSpeedThreshold: 0.02,
    transcodeFallbackAllowed: true,
  },
  medium: {
    tier: 'medium',
    maxPixelRatio: 1.75,
    antialias: true,
    shadows: false,
    gridResolutionMax: 22,
    gridResolutionDraw: 22,
    gridResolutionType: 32,
    particlePoolSize: 130,
    particleMaxSpawnsPerFrame: 3,
    restSpeedThreshold: 0.04,
    transcodeFallbackAllowed: true,
  },
  low: {
    tier: 'low',
    maxPixelRatio: 1.0,
    antialias: false,
    shadows: false,
    gridResolutionMax: 18,
    gridResolutionDraw: 18,
    gridResolutionType: 24,
    particlePoolSize: 60,
    particleMaxSpawnsPerFrame: 2,
    restSpeedThreshold: 0.07,
    transcodeFallbackAllowed: false,
  },
};

class QualityTierManager {
  private currentTier: QualityTier = 'high';
  private isManual: boolean = false;
  private cubeSizeLevel: number = 2; // 1 to 5 (1=Giant, 5=Tiny, Default 2)
  private listeners: Set<(config: QualityConfig) => void> = new Set();
  private cubeSizeListeners: Set<(level: number) => void> = new Set();
  private probeCompleted: boolean = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.currentTier = this.detectInitialTier();
      try {
        const savedLevel = localStorage.getItem('unravel_cube_size_level');
        if (savedLevel) {
          const lvl = parseInt(savedLevel, 10);
          if (lvl >= 1 && lvl <= 5) this.cubeSizeLevel = lvl;
        }
      } catch (e) {}
    }
  }

  public getCubeSizeLevel(): number {
    return this.cubeSizeLevel;
  }

  public setCubeSizeLevel(level: number) {
    if (level >= 1 && level <= 5 && level !== this.cubeSizeLevel) {
      this.cubeSizeLevel = level;
      if (typeof window !== 'undefined') {
        try { localStorage.setItem('unravel_cube_size_level', level.toString()); } catch (e) {}
      }
      const config = this.getConfig();
      this.listeners.forEach((listener) => listener(config));
      // Separate from `listeners`: a cube-size change means the on-screen
      // artwork has to be rebuilt at a new grid resolution, whereas a tier
      // change from the frame-rate probe must not disturb it.
      this.cubeSizeListeners.forEach((listener) => listener(level));
    }
  }

  /**
   * Subscribes to explicit cube-size preference changes only.
   * Returns an unsubscribe function.
   */
  public subscribeCubeSize(listener: (level: number) => void): () => void {
    this.cubeSizeListeners.add(listener);
    return () => {
      this.cubeSizeListeners.delete(listener);
    };
  }

  private getCubeSizeScale(): number {
    switch (this.cubeSizeLevel) {
      case 1: return 0.5;   // Giant cubes (lowest count)
      case 2: return 0.75;
      case 3: return 1.0;   // Normal (base tier config)
      case 4: return 1.25;
      case 5: return 1.5;   // Tiny cubes (highest count)
      default: return 0.75;
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
    const baseConfig = TIER_CONFIGS[this.currentTier];
    if (this.cubeSizeLevel === 3) return baseConfig;

    const scale = this.getCubeSizeScale();
    return {
      ...baseConfig,
      gridResolutionMax: Math.max(8, Math.round(baseConfig.gridResolutionMax * scale)),
      gridResolutionDraw: Math.max(8, Math.round(baseConfig.gridResolutionDraw * scale)),
      gridResolutionType: Math.max(12, Math.round(baseConfig.gridResolutionType * scale)),
    };
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

