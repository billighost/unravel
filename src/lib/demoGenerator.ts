import { qualityTierManager } from './qualityTier';

/** Per-mode tone shaping applied when averaging tiles. */
export type ContrastMode = 'draw' | 'type' | 'photo';

export interface SampledGridResult {
  cols: number;
  rows: number;
  colors: Float32Array; // 3 * N RGB values normalized [0, 1]
  /**
   * Optional high-resolution artwork source. When present each cube samples its
   * own tile of this image, so the picture keeps full detail even though the
   * cube count is deliberately low (bigger cubes feel better to smash).
   *
   * A canvas when freshly sampled; an ImageBitmap/HTMLImageElement when decoded
   * back from a saved creation. Absent for procedural grids.
   */
  textureCanvas?: HTMLCanvasElement | ImageBitmap | HTMLImageElement;
  /**
   * Tone-shaping profile the per-cube averages were produced with. Recorded so
   * the grid can be re-derived from `textureCanvas` at a different cube count
   * (see resampleToGrid) without guessing which curve to reapply.
   */
  contrast?: ContrastMode;
}

/**
 * Generates a colorful procedural pixel art grid (retro sunset/grid pattern)
 * for immediate landing page interaction.
 * Dynamically scales grid resolution based on Quality Tier.
 */
export function generateDemoGrid(targetColsOverride?: number, targetRowsOverride?: number): SampledGridResult {
  const config = qualityTierManager.getConfig();
  const tierMax = config.gridResolutionMax;

  const targetCols = targetColsOverride || Math.round(tierMax * 0.75); // e.g. 60 for high, 45 for med, 30 for low
  const targetRows = targetRowsOverride || Math.round(targetCols * 0.66); // e.g. 40 for high, 30 for med, 20 for low

  const total = targetCols * targetRows;
  const colors = new Float32Array(total * 3);

  for (let r = 0; r < targetRows; r++) {
    for (let c = 0; c < targetCols; c++) {
      const i3 = (r * targetCols + c) * 3;
      const u = c / (targetCols - 1);
      const v = r / (targetRows - 1);

      // Gradient background + sun circle + grid line details
      const distFromCenter = Math.hypot(u - 0.5, (v - 0.35) * 1.2);
      const isSun = distFromCenter < 0.22;

      let rCol: number, gCol: number, bCol: number;

      if (isSun) {
        // Bright yellow / orange sun
        const sunGradient = (0.22 - distFromCenter) / 0.22;
        rCol = 1.0;
        gCol = 0.8 + sunGradient * 0.2;
        bCol = 0.2;
      } else if (v > 0.65) {
        // Dark synthwave grid horizon
        const horizonV = (v - 0.65) / 0.35;
        const gridX = (c % 4 === 0) ? 1.0 : 0.0;
        const gridY = Math.sin(horizonV * Math.PI * 6) > 0.8 ? 1.0 : 0.0;

        rCol = 0.1 + gridX * 0.3 + gridY * 0.2;
        gCol = 0.05 + gridX * 0.2;
        bCol = 0.25 + horizonV * 0.5 + gridX * 0.4;
      } else {
        // Sunset sky (deep magenta to warm peach)
        rCol = 0.95 - v * 0.5;
        gCol = 0.25 + (1 - v) * 0.3;
        bCol = 0.5 + (1 - v) * 0.3;
      }

      // Add subtle retro pixel dithering
      const dither = ((c % 2) ^ (r % 2)) * 0.03;
      colors[i3] = Math.min(Math.max(rCol + dither, 0), 1);
      colors[i3 + 1] = Math.min(Math.max(gCol + dither, 0), 1);
      colors[i3 + 2] = Math.min(Math.max(bCol + dither, 0), 1);
    }
  }

  return {
    cols: targetCols,
    rows: targetRows,
    colors,
  };
}
