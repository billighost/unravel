import { SampledGridResult } from './demoGenerator';
import { downsampleBoxFilter } from './imageSampler';
import { qualityTierManager } from './qualityTier';

/**
 * Renders user text onto a high-res offscreen canvas with native anti-aliasing, padding, and box-filter downsampling.
 * Dynamically scales target grid resolution based on Quality Tier.
 */
export function renderTextToGrid(
  text: string,
  targetColsOverride?: number,
  targetRowsOverride?: number
): SampledGridResult {
  const cleanText = text.trim() || 'UNRAVEL';

  const tierMax = qualityTierManager.getConfig().gridResolutionMax;
  const targetCols = targetColsOverride || Math.round(tierMax * 0.88); // e.g. 70 for high, 52 for med, 35 for low
  const targetRows = targetRowsOverride || Math.round(targetCols * 0.5); // e.g. 35 for high, 26 for med, 17 for low

  // High-res scratch canvas (fixed max width to prevent iOS Safari canvas allocation memory limits)
  const scratchW = 2048;
  const scratchH = Math.round(2048 * (targetRows / targetCols));

  const canvas = document.createElement('canvas');
  canvas.width = scratchW;
  canvas.height = scratchH;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get 2d context for text');

  // Anti-aliasing quality flags
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Background: off-white #F7F6F2
  ctx.fillStyle = '#F7F6F2';
  ctx.fillRect(0, 0, scratchW, scratchH);

  const charCount = cleanText.length;
  // Font selection: Pixelify Sans for shorter text, Space Mono for longer text
  const fontFamily = charCount <= 12 ? '"Pixelify Sans", monospace' : '"Space Mono", monospace';

  // Internal padding (10% on each side)
  const paddingX = scratchW * 0.1;
  const maxAvailableW = scratchW - paddingX * 2;
  const maxAvailableH = scratchH * 0.7;

  // Calculate dynamic font size to fill available space nicely
  let testFontSize = 100;
  ctx.font = `700 ${testFontSize}px ${fontFamily}`;
  let textMetrics = ctx.measureText(cleanText);
  let textW = textMetrics.width;

  // Scale font size to fit width and height with padding
  const scaleW = maxAvailableW / (textW || 1);
  const scaleH = maxAvailableH / testFontSize;
  const fontScale = Math.min(scaleW, scaleH);

  const finalFontSize = Math.floor(testFontSize * fontScale);
  ctx.font = `700 ${finalFontSize}px ${fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#1A1A1A';

  // Draw centered text with anti-aliasing
  ctx.fillText(cleanText, scratchW / 2, scratchH / 2);

  // Box-filter downsample to target grid dimensions with type high-contrast option
  const colors = downsampleBoxFilter(canvas, targetCols, targetRows, 'type');

  return {
    cols: targetCols,
    rows: targetRows,
    colors,
  };
}
