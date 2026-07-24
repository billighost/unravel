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
  particlePoolSize: number;
  particleMaxSpawnsPerFrame: number;
  restSpeedThreshold: number;
  transcodeFallbackAllowed: boolean;
}

const TIER_CONFIGS: Record<QualityTier, QualityConfig> = {
  high: {
    tier: 'high',
    maxPixelRatio: 2.0,
    antialias: true,
    shadows: true,
    gridResolutionMax: 80,
    particlePoolSize: 120,
    particleMaxSpawnsPerFrame: 3,
    restSpeedThreshold: 0.02,
    transcodeFallbackAllowed: true,
  },
  medium: {
    tier: 'medium',
    maxPixelRatio: 1.5,
    antialias: true,
    shadows: false,
    gridResolutionMax: 60,
    particlePoolSize: 60,
    particleMaxSpawnsPerFrame: 2,
    restSpeedThreshold: 0.04,
    transcodeFallbackAllowed: true,
  },
  low: {
    tier: 'low',
    maxPixelRatio: 1.0,
    antialias: false,
    shadows: false,
    gridResolutionMax: 40,
    particlePoolSize: 20,
    particleMaxSpawnsPerFrame: 1,
    restSpeedThreshold: 0.07,
    transcodeFallbackAllowed: false,
  },
};

class QualityTierManager {
  private currentTier: QualityTier = 'high';
  private listeners: Set<(config: QualityConfig) => void> = new Set();
  private probeCompleted: boolean = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.currentTier = this.detectInitialTier();
    }
  }

  /**
   * Performs initial static capability inspection (cores, RAM, user-agent, localStorage).
   */
  private detectInitialTier(): QualityTier {
    // 1. Check if tier was saved from previous session frame probe
    try {
      const saved = localStorage.getItem('unravel_quality_tier');
      if (saved === 'high' || saved === 'medium' || saved === 'low') {
        return saved;
      }
    } catch (e) {}

    // 2. Hardware Concurrency (Core Count)
    const cores = navigator.hardwareConcurrency || 4;
    // 3. Device Memory (RAM in GB, Chrome/Android supported)
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
   * Starts a 1.5-second runtime frame-rate probe during hero animation
   * to accurately measure live render performance.
   */
  public startFrameProbe() {
    if (typeof window === 'undefined' || this.probeCompleted) return;

    let frameTimes: number[] = [];
    let lastTime = performance.now();
    let startTime = lastTime;
    let animId: number;

    const measureFrame = (now: number) => {
      const delta = now - lastTime;
      lastTime = now;

      // Ignore huge deltas caused by tab backgrounding or initial load lag
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

          // Frame time thresholds:
          // Avg > 26ms => < 38 fps => 'low'
          // Avg > 19ms => < 52 fps => 'medium'
          if (avgFrameTime > 26) {
            measuredTier = 'low';
          } else if (avgFrameTime > 19) {
            measuredTier = 'medium';
          }

          // Don't upgrade beyond static limits, but downgrade if real FPS stutters
          const tierPriority: Record<QualityTier, number> = { high: 3, medium: 2, low: 1 };
          if (tierPriority[measuredTier] < tierPriority[this.currentTier]) {
            this.setTier(measuredTier);
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

  public setTier(tier: QualityTier) {
    if (this.currentTier !== tier) {
      this.currentTier = tier;
      try {
        localStorage.setItem('unravel_quality_tier', tier);
      } catch (e) {}

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
