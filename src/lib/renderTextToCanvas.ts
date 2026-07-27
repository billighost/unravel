/**
 * RENDER TEXT TO CANVAS → GRID PIPELINE
 *
 * Renders high-res multi-line text on a scratch canvas, then downsamples it
 * using box filtering to produce a pixel grid suitable for 3D cube rendering.
 */

import { SampledGridResult } from './demoGenerator';
import { downsampleBoxFilter } from './imageSampler';

const BG_COLOR = '#000000';

/**
 * Render text (including multi-line) into a SampledGridResult pixel grid.
 *
 * @param text - Input text (may contain `\n` for line breaks)
 * @param cols - Output grid column count
 * @param rows - Output grid row count (rows = cols / 2 for 2:1 aspect ratio)
 * @param fontFamily - CSS font-family to use for rendering
 */
export function renderTextToGrid(
  text: string,
  cols: number,
  rows: number,
  fontFamily: string = 'sans-serif'
): SampledGridResult {
  const canvas = document.createElement('canvas');
  const superSampleFactor = 4;
  const canvasW = cols * superSampleFactor;
  const canvasH = rows * superSampleFactor;
  canvas.width = canvasW;
  canvas.height = canvasH;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    // Return empty black grid as fallback
    return { cols, rows, colors: new Float32Array(cols * rows * 3) };
  }

  // Fill background
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, canvasW, canvasH);

  // Split into lines
  const lines = text.split('\n').filter((_, i, arr) => i < arr.length || arr[i] !== '');
  // Keep empty trailing line only if user just pressed enter
  const displayLines = text.endsWith('\n') ? [...text.split('\n')] : text.split('\n');
  const lineCount = Math.max(1, displayLines.length);

  // Compute the largest font size that fits all lines within 90% of the canvas
  const maxTextWidth = canvasW * 0.9;
  const maxTextHeight = canvasH * 0.85;
  const lineSpacingRatio = 1.25; // line height multiplier

  let fontSize = Math.floor(maxTextHeight / lineCount);

  // Binary search for best fit font size
  let lo = 4;
  let hi = Math.min(canvasH, 500);
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    ctx.font = `bold ${mid}px ${fontFamily}`;

    const totalLineHeight = mid * lineSpacingRatio * lineCount;
    const maxLineWidth = Math.max(...displayLines.map((l) => ctx.measureText(l || ' ').width));

    if (maxLineWidth <= maxTextWidth && totalLineHeight <= maxTextHeight) {
      fontSize = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  // Render each line centered
  ctx.font = `bold ${fontSize}px ${fontFamily}`;
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const lineHeight = fontSize * lineSpacingRatio;
  const totalBlockHeight = lineHeight * lineCount;
  const startY = (canvasH - totalBlockHeight) / 2 + lineHeight / 2;

  for (let i = 0; i < displayLines.length; i++) {
    const lineText = displayLines[i];
    if (lineText.length === 0 && i === displayLines.length - 1 && text.endsWith('\n')) {
      continue; // skip trailing empty line from final newline
    }
    ctx.fillText(lineText, canvasW / 2, startY + i * lineHeight);
  }

  // Downsample using the box filter from imageSampler
  const colors = downsampleBoxFilter(canvas, cols, rows, 'type');

  return { cols, rows, colors };
}

/**
 * Calculate the display font size that would fit multi-line text
 * within a given container width and height, for use in the live preview.
 */
export function calculatePreviewFontSize(
  text: string,
  containerWidth: number,
  containerHeight: number,
  fontFamily: string = 'sans-serif'
): number {
  const canvas = document.createElement('canvas');
  canvas.width = containerWidth;
  canvas.height = containerHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return 16;

  const lines = text.split('\n');
  const lineCount = Math.max(1, lines.length);
  const lineSpacingRatio = 1.25;

  const maxTextWidth = containerWidth * 0.92;
  const maxTextHeight = containerHeight * 0.9;

  let fontSize = 16;
  let lo = 8;
  let hi = Math.min(containerHeight, 200);

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    ctx.font = `bold ${mid}px ${fontFamily}`;

    const totalLineHeight = mid * lineSpacingRatio * lineCount;
    const maxLineWidth = Math.max(...lines.map((l) => ctx.measureText(l || ' ').width));

    if (maxLineWidth <= maxTextWidth && totalLineHeight <= maxTextHeight) {
      fontSize = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return fontSize;
}
