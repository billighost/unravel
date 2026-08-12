/**
 * RENDER TEXT TO CANVAS → GRID PIPELINE
 *
 * Renders multi-line text on a tile-resolution canvas, then downsamples it to
 * per-cube average colours for the 3D grid.
 *
 * Layout lives in `layoutTextBlock`, which is shared by the live preview and
 * the canvas renderer. That sharing is the point: the preview used to wrap with
 * CSS while the canvas only broke on explicit newlines, so a paragraph that
 * looked like six tidy lines in the preview was rendered onto the cubes as one
 * enormous line squeezed down to nothing.
 */

import { SampledGridResult } from './demoGenerator';
import { sampleTileAverages } from './imageSampler';
import { createTileCanvas } from './cubeTexture';

const BG_COLOR = '#000000';
const TEXT_COLOR = '#FFFFFF';

/** Multiplier from font size to baseline-to-baseline distance. */
export const LINE_SPACING_RATIO = 1.22;

/** Fraction of the box the text block is allowed to occupy. */
const WIDTH_RATIO = 0.92;
const HEIGHT_RATIO = 0.86;

const MIN_FONT_SIZE = 4;

export interface TextLayout {
  /** Chosen font size in pixels, relative to the box passed in. */
  fontSize: number;
  /** Text after word wrapping — draw exactly these, in order. */
  lines: string[];
  /** Baseline-to-baseline distance in pixels. */
  lineHeight: number;
}

/**
 * Shared scratch context for text measurement.
 *
 * Layout runs on every keystroke, and allocating a canvas each time was pure
 * waste — measureText does not care about canvas dimensions.
 */
let measureCtx: CanvasRenderingContext2D | null = null;

function getMeasureContext(): CanvasRenderingContext2D | null {
  if (measureCtx) return measureCtx;
  if (typeof document === 'undefined') return null;
  measureCtx = document.createElement('canvas').getContext('2d');
  return measureCtx;
}

/**
 * Expands `var(--name)` references in a font-family string.
 *
 * Fonts are self-hosted via next/font, so the real family name is a generated
 * identifier exposed through a CSS custom property. CSS resolves those
 * variables itself, but `ctx.font` does not parse `var()` and silently keeps its
 * previous value — which would have rendered every Type-mode font as the
 * default. Resolving against the document gives the canvas the real names.
 */
export function resolveFontFamily(fontFamily: string): string {
  if (!fontFamily.includes('var(') || typeof document === 'undefined') return fontFamily;

  const rootStyle = getComputedStyle(document.documentElement);

  return fontFamily.replace(/var\(\s*(--[\w-]+)\s*(?:,([^)]*))?\)/g, (_match, name, fallback) => {
    const resolved = rootStyle.getPropertyValue(name).trim();
    if (resolved) return resolved;
    return (fallback || '').trim();
  });
}

/**
 * Greedily wraps one paragraph to `maxWidth` using the context's current font.
 * Words longer than the line (a URL, a keysmash) are split mid-word rather than
 * being allowed to overflow.
 */
function wrapParagraph(
  ctx: CanvasRenderingContext2D,
  paragraph: string,
  maxWidth: number
): string[] {
  if (paragraph.length === 0) return [''];

  const words = paragraph.split(' ');
  const lines: string[] = [];
  let current = '';

  const pushWordBrokenUp = (word: string) => {
    let chunk = '';
    for (const char of word) {
      if (chunk && ctx.measureText(chunk + char).width > maxWidth) {
        lines.push(chunk);
        chunk = char;
      } else {
        chunk += char;
      }
    }
    current = chunk;
  };

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;

    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
      continue;
    }

    if (current) {
      lines.push(current);
      current = '';
    }

    if (ctx.measureText(word).width > maxWidth) {
      pushWordBrokenUp(word);
    } else {
      current = word;
    }
  }

  lines.push(current);
  return lines;
}

/**
 * Fits text into a box: picks the largest font size at which the word-wrapped
 * block fits both axes, and returns the wrapped lines for that size.
 *
 * Short text therefore renders huge and a long paragraph scales itself down
 * until it fits, which is what makes both readable on the same cube grid.
 */
export function layoutTextBlock(
  text: string,
  boxWidth: number,
  boxHeight: number,
  fontFamily: string = 'sans-serif'
): TextLayout {
  const fallback: TextLayout = { fontSize: 16, lines: [text], lineHeight: 16 * LINE_SPACING_RATIO };

  const ctx = getMeasureContext();
  if (!ctx || boxWidth <= 0 || boxHeight <= 0) return fallback;

  const family = resolveFontFamily(fontFamily);
  const maxWidth = boxWidth * WIDTH_RATIO;
  const maxHeight = boxHeight * HEIGHT_RATIO;

  // Drop a single trailing newline: it is the "user just pressed enter" state
  // and should not reserve a blank line's worth of height.
  const source = text.endsWith('\n') ? text.slice(0, -1) : text;
  const paragraphs = source.split('\n');

  const layoutAt = (fontSize: number): string[] => {
    ctx.font = `bold ${fontSize}px ${family}`;
    const lines: string[] = [];
    for (const paragraph of paragraphs) {
      lines.push(...wrapParagraph(ctx, paragraph, maxWidth));
    }
    return lines;
  };

  const fits = (fontSize: number, lines: string[]): boolean =>
    lines.length * fontSize * LINE_SPACING_RATIO <= maxHeight;

  let best = MIN_FONT_SIZE;
  let bestLines = layoutAt(MIN_FONT_SIZE);

  let lo = MIN_FONT_SIZE;
  let hi = Math.max(MIN_FONT_SIZE, Math.ceil(maxHeight));

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const lines = layoutAt(mid);

    if (fits(mid, lines)) {
      best = mid;
      bestLines = lines;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return { fontSize: best, lines: bestLines, lineHeight: best * LINE_SPACING_RATIO };
}

/**
 * Render text (including multi-line and wrapped paragraphs) into a
 * SampledGridResult pixel grid.
 *
 * @param text - Input text (may contain `\n` for line breaks)
 * @param cols - Output grid column count
 * @param rows - Output grid row count
 * @param fontFamily - CSS font-family to use for rendering
 */
export function renderTextToGrid(
  text: string,
  cols: number,
  rows: number,
  fontFamily: string = 'sans-serif'
): SampledGridResult {
  // Render straight into a tile-resolution canvas. Rendering small and letting
  // buildTileTexture scale up (the previous approach) meant the glyphs on the
  // cube faces were a ~7x upscale of a 4x-supersampled canvas — soft edges on
  // what should be the crispest mode.
  const tile = createTileCanvas(cols, rows);
  const ctx = tile?.canvas.getContext('2d');

  if (!tile || !ctx) {
    // Return empty black grid as fallback
    return { cols, rows, colors: new Float32Array(cols * rows * 3) };
  }

  const canvas = tile.canvas;
  const canvasW = canvas.width;
  const canvasH = canvas.height;

  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, canvasW, canvasH);

  const { fontSize, lines, lineHeight } = layoutTextBlock(text, canvasW, canvasH, fontFamily);

  ctx.font = `bold ${fontSize}px ${resolveFontFamily(fontFamily)}`;
  ctx.fillStyle = TEXT_COLOR;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const blockHeight = lineHeight * lines.length;
  const startY = (canvasH - blockHeight) / 2 + lineHeight / 2;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].length === 0) continue;
    ctx.fillText(lines[i], canvasW / 2, startY + i * lineHeight);
  }

  // Downsample to per-cube averages via a small scratch canvas.
  const colors = sampleTileAverages(canvas, cols, rows, 'type');

  // The canvas is already an exact multiple of the grid, so it doubles as the
  // per-cube tile texture — cubes show the actual rendered glyphs at full
  // resolution rather than a flat averaged colour.
  return { cols, rows, colors, textureCanvas: canvas, contrast: 'type' };
}
