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
 * Per-tile pixel density for a given grid, capped so the resulting texture
 * stays inside mobile GPU limits.
 */
export function chooseTilePixels(cols: number, rows: number): number {
  const maxByWidth = Math.floor(MAX_TEXTURE_DIMENSION / cols);
  const maxByHeight = Math.floor(MAX_TEXTURE_DIMENSION / rows);
  return Math.max(2, Math.min(PIXELS_PER_TILE, maxByWidth, maxByHeight));
}

/**
 * Allocates a blank canvas whose dimensions are an exact integer multiple of
 * the cube grid. Callers that generate their artwork procedurally (text mode)
 * draw straight into this at full texture resolution rather than rendering
 * small and being upscaled by buildTileTexture.
 */
export function createTileCanvas(cols: number, rows: number): CubeTileTexture | null {
  if (typeof document === 'undefined' || cols <= 0 || rows <= 0) return null;

  const perTile = chooseTilePixels(cols, rows);
  const canvas = document.createElement('canvas');
  canvas.width = cols * perTile;
  canvas.height = rows * perTile;

  return { canvas, tilePixelsX: perTile, tilePixelsY: perTile };
}

/**
 * Renders a source image/canvas into a canvas whose dimensions are an exact
 * integer multiple of the cube grid, so each cube gets a clean pixel block.
 *
 * The 2D context is deliberately left GPU-backed (no `willReadFrequently`):
 * this canvas is only ever drawn into and then uploaded as a WebGL texture.
 * Per-tile averages are sampled from a small scratch canvas instead — see
 * `sampleTileAverages` in imageSampler.ts.
 */
export function buildTileTexture(
  source: HTMLImageElement | HTMLCanvasElement | ImageBitmap,
  cols: number,
  rows: number
): CubeTileTexture | null {
  const tile = createTileCanvas(cols, rows);
  if (!tile) return null;

  const ctx = tile.canvas.getContext('2d');
  if (!ctx) return null;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source as CanvasImageSource, 0, 0, tile.canvas.width, tile.canvas.height);

  return tile;
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
