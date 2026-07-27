import { SampledGridResult } from './demoGenerator';
import { qualityTierManager } from './qualityTier';

/**
 * Downsamples ImageData or Canvas into a grid using Box-Filter pixel averaging
 * with a subtle saturation & contrast correction to preserve color vividness.
 */
export function downsampleBoxFilter(
  sourceCanvas: HTMLCanvasElement,
  cols: number,
  rows: number,
  contrastMode?: 'draw' | 'type' | 'photo'
): Float32Array {
  const srcW = sourceCanvas.width;
  const srcH = sourceCanvas.height;
  const ctx = sourceCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D context creation failed');

  const imgData = ctx.getImageData(0, 0, srcW, srcH);
  const data = imgData.data;
  const colors = new Float32Array(cols * rows * 3);

  for (let r = 0; r < rows; r++) {
    const startY = Math.floor((r / rows) * srcH);
    const endY = Math.min(Math.ceil(((r + 1) / rows) * srcH), srcH);

    for (let c = 0; c < cols; c++) {
      const startX = Math.floor((c / cols) * srcW);
      const endX = Math.min(Math.ceil(((c + 1) / cols) * srcW), srcW);

      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let pixelCount = 0;

      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          const idx = (y * srcW + x) * 4;
          rSum += data[idx];
          gSum += data[idx + 1];
          bSum += data[idx + 2];
          pixelCount++;
        }
      }

      const gridIdx = (r * cols + c) * 3;
      if (pixelCount > 0) {
        let rVal = rSum / pixelCount / 255;
        let gVal = gSum / pixelCount / 255;
        let bVal = bSum / pixelCount / 255;

        if (contrastMode === 'draw') {
          // Gamma correction to lift thin stroke details
          rVal = Math.pow(rVal, 0.55);
          gVal = Math.pow(gVal, 0.55);
          bVal = Math.pow(bVal, 0.55);

          // Boost brightness of dim colored pixels to keep strokes vivid
          const maxVal = Math.max(rVal, gVal, bVal);
          if (maxVal > 0 && maxVal < 0.95) {
            const boost = Math.min(1.0 / maxVal, 1.4);
            rVal = Math.min(1, rVal * boost);
            gVal = Math.min(1, gVal * boost);
            bVal = Math.min(1, bVal * boost);
          }
        } else if (contrastMode === 'type') {
          // Sigmoid thresholding to keep text edges crisp
          const gray = 0.299 * rVal + 0.587 * gVal + 0.114 * bVal;
          const k = 14; // Steepness parameter
          const sigmoid = 1 / (1 + Math.exp(-k * (gray - 0.65)));

          // Interpolate between text ink #1A1A1A and page background #F7F6F2
          rVal = 0.10 + (0.97 - 0.10) * sigmoid;
          gVal = 0.10 + (0.96 - 0.10) * sigmoid;
          bVal = 0.10 + (0.95 - 0.10) * sigmoid;
        } else {
          // Apply subtle saturation (1.12x) and contrast (1.05x) enhancement for photos
          const gray = 0.299 * rVal + 0.587 * gVal + 0.114 * bVal;
          rVal = Math.min(1, Math.max(0, gray + (rVal - gray) * 1.12));
          gVal = Math.min(1, Math.max(0, gray + (gVal - gray) * 1.12));
          bVal = Math.min(1, Math.max(0, gray + (bVal - gray) * 1.12));

          rVal = Math.min(1, Math.max(0, (rVal - 0.5) * 1.05 + 0.5));
          gVal = Math.min(1, Math.max(0, (gVal - 0.5) * 1.05 + 0.5));
          bVal = Math.min(1, Math.max(0, (gVal - 0.5) * 1.05 + 0.5));
        }

        colors[gridIdx] = rVal;
        colors[gridIdx + 1] = gVal;
        colors[gridIdx + 2] = bVal;
      } else {
        colors[gridIdx] = 0;
        colors[gridIdx + 1] = 0;
        colors[gridIdx + 2] = 0;
      }
    }
  }

  return colors;
}

/**
 * Downsamples an HTMLImageElement or File into an N x M grid of cube colors using box-filter.
 * Respects Quality Tier grid limits.
 */
export async function sampleImageToGrid(
  imageSource: HTMLImageElement | File | string,
  maxDimensionOverride?: number
): Promise<SampledGridResult> {
  let img: HTMLImageElement;

  if (typeof imageSource === 'string') {
    img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imageSource;
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });
  } else if (imageSource instanceof File) {
    const url = URL.createObjectURL(imageSource);
    img = new Image();
    img.src = url;
    await new Promise((resolve, reject) => {
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.onerror = reject;
    });
  } else {
    img = imageSource;
  }

  const tierMax = qualityTierManager.getConfig().gridResolutionMax;
  const maxDimension = maxDimensionOverride || tierMax;

  const aspect = img.width / img.height;
  let cols: number;
  let rows: number;

  if (aspect >= 1) {
    cols = maxDimension;
    rows = Math.max(Math.round(maxDimension / aspect), 10);
  } else {
    rows = maxDimension;
    cols = Math.max(Math.round(maxDimension * aspect), 10);
  }

  // Render on a high-resolution canvas (~6x supersampling for high detail)
  const supersampleFactor = 6;
  const canvas = document.createElement('canvas');
  canvas.width = cols * supersampleFactor;
  canvas.height = rows * supersampleFactor;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context creation failed');

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const colors = downsampleBoxFilter(canvas, cols, rows);

  return { cols, rows, colors };
}

/**
 * Downsamples an HTMLCanvasElement directly into a grid (used by Draw Mode) with box-filter.
 * Respects Quality Tier grid limits.
 */
export function sampleCanvasToGrid(
  sourceCanvas: HTMLCanvasElement,
  maxDimensionOverride?: number
): SampledGridResult {
  const tierMax = qualityTierManager.getConfig().gridResolutionMax;
  const maxDimension = maxDimensionOverride || Math.round(tierMax * 0.88);

  const aspect = sourceCanvas.width / sourceCanvas.height;
  let cols: number;
  let rows: number;

  if (aspect >= 1) {
    cols = maxDimension;
    rows = Math.max(Math.round(maxDimension / aspect), 10);
  } else {
    rows = maxDimension;
    cols = Math.max(Math.round(maxDimension * aspect), 10);
  }

  const colors = downsampleBoxFilter(sourceCanvas, cols, rows, 'draw');

  return { cols, rows, colors };
}
