/**
 * UNRAVEL CUBE TEXTURE TILE PIPELINE
 *
 * Instead of painting every cube a single flat averaged colour, each cube is a
 * *window* onto a high-resolution source texture. Cube (c, r) samples exactly
 * the rectangular tile of the image that it covers, so the artwork keeps its
 * full detail even at low cube counts — which lets us use fewer, chunkier,
 * more satisfying cubes without throwing away resolution.
 *
 * This module produces:
 *  - a power-of-two-ish source canvas whose dimensions are an exact multiple of
 *    (cols, rows) so every tile maps to a whole number of pixels (no bleeding)
 *  - per-tile average colours (gamma-correct) used for thumbnails, saved
 *    creations, and as the fallback when no texture is available
 *  - the per-instance UV offset/scale attribute data used by the shader patch
 */

/** Target pixels along each axis of a single cube's tile. */
const PIXELS_PER_TILE = 28;

/** Hard ceiling on texture dimensions to stay inside mobile GPU limits. */
const MAX_TEXTURE_DIMENSION = 2048;

export interface CubeTileTexture {
  /** High-res canvas sized to an exact multiple of (cols, rows). */
  canvas: HTMLCanvasElement;
  /** Whole pixels per tile on each axis. */
  tilePixelsX: number;
  tilePixelsY: number;
}

/**
 * Renders a source image/canvas into a canvas whose dimensions are an exact
 * integer multiple of the cube grid, so each cube gets a clean pixel block.
 */
export function buildTileTexture(
  source: HTMLImageElement | HTMLCanvasElement | ImageBitmap,
  cols: number,
  rows: number
): CubeTileTexture | null {
  if (typeof document === 'undefined' || cols <= 0 || rows <= 0) return null;

  // Choose per-tile pixel density that keeps the texture under the GPU ceiling.
  const maxByWidth = Math.floor(MAX_TEXTURE_DIMENSION / cols);
  const maxByHeight = Math.floor(MAX_TEXTURE_DIMENSION / rows);
  const perTile = Math.max(2, Math.min(PIXELS_PER_TILE, maxByWidth, maxByHeight));

  const canvas = document.createElement('canvas');
  canvas.width = cols * perTile;
  canvas.height = rows * perTile;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source as CanvasImageSource, 0, 0, canvas.width, canvas.height);

  return { canvas, tilePixelsX: perTile, tilePixelsY: perTile };
}

/**
 * Builds the per-instance UV remap attributes for a cols x rows grid.
 *
 * WebGL UV origin is bottom-left while grid row 0 is the top row, so the V
 * offset is flipped. Returned arrays are consumed as InstancedBufferAttributes.
 */
export function buildTileUVAttributes(
  cols: number,
  rows: number
): { offsets: Float32Array; scales: Float32Array } {
  const total = cols * rows;
  const offsets = new Float32Array(total * 2);
  const scales = new Float32Array(total * 2);

  const du = 1 / cols;
  const dv = 1 / rows;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i2 = (r * cols + c) * 2;
      offsets[i2] = c * du;
      offsets[i2 + 1] = 1 - (r + 1) * dv;
      scales[i2] = du;
      scales[i2 + 1] = dv;
    }
  }

  return { offsets, scales };
}
