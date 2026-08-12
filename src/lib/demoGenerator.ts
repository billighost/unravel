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
   * Deliberately NOT an ImageBitmap: three.js ignores `Texture.flipY` for image
   * bitmaps, so one uploads with its rows inverted relative to the UV mapping in
   * cubeTexture.ts and the artwork renders upside down. Decoded bitmaps are
   * drawn into a canvas before they get here (see storage.restoreSavedGrid).
   */
  textureCanvas?: HTMLCanvasElement | HTMLImageElement;
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

  const targetCols = targetColsOverride || Math.round(tierMax * 0.75);
  const targetRows = targetRowsOverride || Math.round(targetCols * 0.66);

  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    const canvasW = 1024;
    const canvasH = Math.round(canvasW * (targetRows / targetCols));
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
      const hue1 = Math.floor(Math.random() * 360);
      const hue2 = (hue1 + 60 + Math.random() * 60) % 360; 
      
      const grad = ctx.createLinearGradient(0, 0, canvasW, canvasH);
      grad.addColorStop(0, `hsl(${hue1}, 80%, 60%)`);
      grad.addColorStop(1, `hsl(${hue2}, 80%, 40%)`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvasW, canvasH);
      
      const textHue = (hue1 + 180) % 360;
      ctx.fillStyle = `hsl(${textHue}, 100%, 95%)`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `bold ${Math.floor(canvasW * 0.15)}px "Pixelify Sans", monospace, sans-serif`;
      ctx.fillText("UNRAVEL", canvasW / 2, canvasH / 2);
      
      const smallCanvas = document.createElement('canvas');
      smallCanvas.width = targetCols;
      smallCanvas.height = targetRows;
      const smallCtx = smallCanvas.getContext('2d');
      if (smallCtx) {
        smallCtx.drawImage(canvas, 0, 0, targetCols, targetRows);
        const data = smallCtx.getImageData(0, 0, targetCols, targetRows).data;
        const total = targetCols * targetRows;
        const colors = new Float32Array(total * 3);
        for (let i = 0; i < total; i++) {
          colors[i * 3] = data[i * 4] / 255;
          colors[i * 3 + 1] = data[i * 4 + 1] / 255;
          colors[i * 3 + 2] = data[i * 4 + 2] / 255;
        }
        return {
          cols: targetCols,
          rows: targetRows,
          colors,
          textureCanvas: canvas,
        };
      }
    }
  }

  const total = targetCols * targetRows;
  const colors = new Float32Array(total * 3);
  return {
    cols: targetCols,
    rows: targetRows,
    colors,
  };
}
