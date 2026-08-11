import { SampledGridResult } from './demoGenerator';
import { qualityTierManager } from './qualityTier';
import { buildTileTexture } from './cubeTexture';

/**
 * sRGB <-> linear conversion tables.
 *
 * Averaging colours in sRGB space is mathematically wrong and visibly muddies
 * the result — mid-greys go dark and saturated edges go grey. We convert to
 * linear light, average there, then convert back. This is the single biggest
 * quality win in the whole downsampling path.
 */
const SRGB_TO_LINEAR = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  SRGB_TO_LINEAR[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c: number): number {
  if (c <= 0) return 0;
  if (c >= 1) return 1;
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

/**
 * Downsamples a canvas into a grid of per-tile average colours using a
 * gamma-correct box filter, with per-mode tone shaping.
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
        const rowOffset = y * srcW;
        for (let x = startX; x < endX; x++) {
          const idx = (rowOffset + x) * 4;
          // Accumulate in linear light, not sRGB.
          rSum += SRGB_TO_LINEAR[data[idx]];
          gSum += SRGB_TO_LINEAR[data[idx + 1]];
          bSum += SRGB_TO_LINEAR[data[idx + 2]];
          pixelCount++;
        }
      }

      const gridIdx = (r * cols + c) * 3;
      if (pixelCount === 0) {
        colors[gridIdx] = 0;
        colors[gridIdx + 1] = 0;
        colors[gridIdx + 2] = 0;
        continue;
      }

      // Average in linear space, then return to sRGB for display.
      let rVal = linearToSrgb(rSum / pixelCount);
      let gVal = linearToSrgb(gSum / pixelCount);
      let bVal = linearToSrgb(bSum / pixelCount);

      if (contrastMode === 'draw') {
        // Lift thin strokes that would otherwise average away to near-white.
        rVal = Math.pow(rVal, 0.72);
        gVal = Math.pow(gVal, 0.72);
        bVal = Math.pow(bVal, 0.72);

        const maxVal = Math.max(rVal, gVal, bVal);
        if (maxVal > 0 && maxVal < 0.95) {
          const boost = Math.min(1.0 / maxVal, 1.35);
          rVal = Math.min(1, rVal * boost);
          gVal = Math.min(1, gVal * boost);
          bVal = Math.min(1, bVal * boost);
        }
      } else if (contrastMode === 'type') {
        // Sigmoid threshold keeps glyph edges crisp instead of grey-fringed.
        const gray = 0.2126 * rVal + 0.7152 * gVal + 0.0722 * bVal;
        const k = 14;
        const sigmoid = 1 / (1 + Math.exp(-k * (gray - 0.55)));

        rVal = 0.10 + (0.97 - 0.10) * sigmoid;
        gVal = 0.10 + (0.96 - 0.10) * sigmoid;
        bVal = 0.10 + (0.95 - 0.10) * sigmoid;
      } else {
        // Gentle vibrance for photos. Uses Rec.709 luma; each channel is
        // pushed away from luma independently.
        const gray = 0.2126 * rVal + 0.7152 * gVal + 0.0722 * bVal;
        rVal = Math.min(1, Math.max(0, gray + (rVal - gray) * 1.14));
        gVal = Math.min(1, Math.max(0, gray + (gVal - gray) * 1.14));
        bVal = Math.min(1, Math.max(0, gray + (bVal - gray) * 1.14));

        rVal = Math.min(1, Math.max(0, (rVal - 0.5) * 1.06 + 0.5));
        gVal = Math.min(1, Math.max(0, (gVal - 0.5) * 1.06 + 0.5));
        bVal = Math.min(1, Math.max(0, (bVal - 0.5) * 1.06 + 0.5));
      }

      colors[gridIdx] = rVal;
      colors[gridIdx + 1] = gVal;
      colors[gridIdx + 2] = bVal;
    }
  }

  return colors;
}

/** Loads any accepted image source into a decoded HTMLImageElement. */
async function resolveImageElement(
  imageSource: HTMLImageElement | File | string
): Promise<HTMLImageElement> {
  if (imageSource instanceof HTMLImageElement) return imageSource;

  const isFile = imageSource instanceof File;
  const url = isFile ? URL.createObjectURL(imageSource) : (imageSource as string);
  const img = new Image();
  if (!isFile) img.crossOrigin = 'anonymous';

  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Image failed to load'));
      img.src = url;
    });
  } finally {
    // Revoke on both success and failure to avoid leaking the blob URL.
    if (isFile) URL.revokeObjectURL(url);
  }

  return img;
}

/**
 * Computes grid dimensions that preserve the source aspect ratio while keeping
 * the long edge at `maxDimension` cubes.
 */
function fitGrid(aspect: number, maxDimension: number): { cols: number; rows: number } {
  if (!isFinite(aspect) || aspect <= 0) {
    return { cols: maxDimension, rows: maxDimension };
  }
  if (aspect >= 1) {
    return { cols: maxDimension, rows: Math.max(Math.round(maxDimension / aspect), 8) };
  }
  return { rows: maxDimension, cols: Math.max(Math.round(maxDimension * aspect), 8) };
}

/**
 * Samples an image into a cube grid.
 *
 * Returns both per-tile average colours *and* a tile texture canvas. The grid
 * stays deliberately coarse (big, satisfying cubes) while the texture carries
 * the full image detail, so quality no longer trades off against cube size.
 */
export async function sampleImageToGrid(
  imageSource: HTMLImageElement | File | string,
  maxDimensionOverride?: number
): Promise<SampledGridResult> {
  const img = await resolveImageElement(imageSource);

  const tierMax = qualityTierManager.getConfig().gridResolutionMax;
  const maxDimension = maxDimensionOverride || tierMax;

  const { cols, rows } = fitGrid(img.width / img.height, maxDimension);

  const tile = buildTileTexture(img, cols, rows);
  if (!tile) {
    throw new Error('Canvas 2D context creation failed');
  }

  const colors = downsampleBoxFilter(tile.canvas, cols, rows, 'photo');

  return { cols, rows, colors, textureCanvas: tile.canvas };
}

/**
 * Samples a canvas (Draw Mode) into a cube grid, keeping the drawing itself as
 * the tile texture so brush detail survives at low cube counts.
 */
export function sampleCanvasToGrid(
  sourceCanvas: HTMLCanvasElement,
  maxDimensionOverride?: number
): SampledGridResult {
  const tierMax = qualityTierManager.getConfig().gridResolutionDraw;
  const maxDimension = maxDimensionOverride || tierMax;

  const { cols, rows } = fitGrid(sourceCanvas.width / sourceCanvas.height, maxDimension);

  const tile = buildTileTexture(sourceCanvas, cols, rows);
  const textureSource = tile ? tile.canvas : sourceCanvas;
  const colors = downsampleBoxFilter(textureSource, cols, rows, 'draw');

  return { cols, rows, colors, textureCanvas: tile ? tile.canvas : undefined };
}
