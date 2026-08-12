/**
 * ARTWORK GENERATOR FOR SEED DATA
 *
 * Produces raw RGB pixel buffers for the three creation modes, plus the
 * per-cube averaging that turns a buffer into an Unravel grid.
 *
 * Everything is pure maths on a Uint8Array — no canvas, no fonts, no native
 * deps — so it runs identically in a plain Node script. The averaging mirrors
 * `downsampleBoxFilter` in src/lib/imageSampler.ts, including its gamma-correct
 * accumulation and the three per-mode tone curves, so seeded creations land on
 * the same colour values the real client would have produced.
 */

export type ContrastMode = 'draw' | 'type' | 'photo';

export interface Bitmap {
  width: number;
  height: number;
  /** RGB, 3 bytes per pixel. */
  data: Uint8Array;
}

// ─── Deterministic randomness ────────────────────────────────────────────────

/** mulberry32 — small, fast, and reproducible from a single integer seed. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rng = () => number;

const pick = <T>(rng: Rng, items: readonly T[]): T => items[Math.floor(rng() * items.length)];
const range = (rng: Rng, lo: number, hi: number) => lo + rng() * (hi - lo);
const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);

// ─── Palettes ────────────────────────────────────────────────────────────────

type Rgb = [number, number, number];

/**
 * Hand-picked ramps. Each is ordered dark → light so a ramp lookup doubles as a
 * luminance ramp, which keeps the downsampled cube grid readable.
 */
const PALETTES: { name: string; stops: Rgb[] }[] = [
  { name: 'ember', stops: [[24, 12, 30], [86, 22, 58], [193, 48, 62], [242, 118, 45], [252, 205, 116]] },
  { name: 'lagoon', stops: [[10, 26, 47], [17, 74, 96], [26, 140, 139], [96, 200, 173], [222, 245, 220]] },
  { name: 'orchid', stops: [[27, 14, 44], [78, 28, 96], [148, 51, 148], [219, 112, 186], [250, 214, 232]] },
  { name: 'citrus', stops: [[26, 32, 18], [66, 96, 32], [141, 174, 42], [226, 217, 68], [253, 248, 197]] },
  { name: 'dusk', stops: [[16, 18, 42], [52, 45, 110], [113, 88, 178], [193, 140, 214], [248, 216, 236]] },
  { name: 'clay', stops: [[32, 20, 16], [96, 51, 38], [166, 96, 62], [216, 155, 106], [246, 226, 190]] },
  { name: 'arctic', stops: [[14, 22, 38], [38, 74, 120], [86, 145, 196], [158, 205, 235], [240, 250, 255]] },
  { name: 'neon', stops: [[10, 10, 18], [42, 18, 84], [0, 168, 176], [120, 244, 132], [255, 246, 168]] },
];

/** Samples a palette at t ∈ [0,1] with linear interpolation between stops. */
function rampAt(stops: Rgb[], t: number): Rgb {
  const x = Math.min(0.99999, Math.max(0, t)) * (stops.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  const a = stops[i];
  const b = stops[Math.min(i + 1, stops.length - 1)];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

// ─── Buffer helpers ──────────────────────────────────────────────────────────

function createBitmap(width: number, height: number): Bitmap {
  return { width, height, data: new Uint8Array(width * height * 3) };
}

/** Alpha-blends a colour into one pixel. */
function blend(bmp: Bitmap, x: number, y: number, c: Rgb, alpha: number) {
  if (alpha <= 0 || x < 0 || y < 0 || x >= bmp.width || y >= bmp.height) return;
  const i = (y * bmp.width + x) * 3;
  const a = alpha > 1 ? 1 : alpha;
  bmp.data[i] = clamp255(bmp.data[i] * (1 - a) + c[0] * a);
  bmp.data[i + 1] = clamp255(bmp.data[i + 1] * (1 - a) + c[1] * a);
  bmp.data[i + 2] = clamp255(bmp.data[i + 2] * (1 - a) + c[2] * a);
}

/** Fills the whole buffer from a per-pixel function. */
function fill(bmp: Bitmap, fn: (u: number, v: number, x: number, y: number) => Rgb) {
  const { width, height, data } = bmp;
  for (let y = 0; y < height; y++) {
    const v = y / (height - 1);
    for (let x = 0; x < width; x++) {
      const c = fn(x / (width - 1), v, x, y);
      const i = (y * width + x) * 3;
      data[i] = clamp255(c[0]);
      data[i + 1] = clamp255(c[1]);
      data[i + 2] = clamp255(c[2]);
    }
  }
}

/** Soft round brush dab, used by the stroke-based styles. */
function dab(bmp: Bitmap, cx: number, cy: number, radius: number, c: Rgb, strength: number) {
  const r = Math.ceil(radius);
  const x0 = Math.max(0, Math.floor(cx) - r);
  const x1 = Math.min(bmp.width - 1, Math.ceil(cx) + r);
  const y0 = Math.max(0, Math.floor(cy) - r);
  const y1 = Math.min(bmp.height - 1, Math.ceil(cy) + r);
  const r2 = radius * radius;

  for (let y = y0; y <= y1; y++) {
    const dy = y - cy;
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      // Smooth falloff so strokes have soft, painterly edges.
      const falloff = 1 - Math.sqrt(d2) / radius;
      blend(bmp, x, y, c, strength * falloff * falloff);
    }
  }
}

/** Draws a tapered brush stroke along a cubic Bezier. */
function strokeBezier(
  bmp: Bitmap,
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
  p3: [number, number],
  widthPx: number,
  c: Rgb,
  strength: number
) {
  const steps = 160;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const mt = 1 - t;
    const x =
      mt * mt * mt * p0[0] + 3 * mt * mt * t * p1[0] + 3 * mt * t * t * p2[0] + t * t * t * p3[0];
    const y =
      mt * mt * mt * p0[1] + 3 * mt * mt * t * p1[1] + 3 * mt * t * t * p2[1] + t * t * t * p3[1];
    // Taper towards both ends so strokes read as brush marks, not tubes.
    const taper = Math.sin(Math.PI * t) * 0.65 + 0.35;
    dab(bmp, x, y, (widthPx / 2) * taper, c, strength);
  }
}

// ─── Draw-mode styles ────────────────────────────────────────────────────────

function flowRibbons(bmp: Bitmap, rng: Rng, stops: Rgb[]) {
  const freqA = range(rng, 2.2, 4.5);
  const freqB = range(rng, 1.4, 3.6);
  const warp = range(rng, 0.18, 0.42);
  const bands = Math.floor(range(rng, 4, 9));
  const phase = range(rng, 0, Math.PI * 2);

  fill(bmp, (u, v) => {
    const wx = u + Math.sin(v * freqA * Math.PI + phase) * warp;
    const wy = v + Math.cos(u * freqB * Math.PI - phase) * warp * 0.6;
    const band = (Math.sin((wx + wy) * bands * Math.PI) + 1) / 2;
    const shade = 0.72 + 0.28 * Math.sin(wy * Math.PI);
    const c = rampAt(stops, band * 0.85 + v * 0.15);
    return [c[0] * shade, c[1] * shade, c[2] * shade];
  });
}

function mandala(bmp: Bitmap, rng: Rng, stops: Rgb[]) {
  const petals = Math.floor(range(rng, 6, 16));
  const rings = range(rng, 3.5, 8);
  const twist = range(rng, 0, 2.4);

  fill(bmp, (u, v) => {
    const dx = u - 0.5;
    const dy = (v - 0.5) * 0.9;
    const r = Math.sqrt(dx * dx + dy * dy) * 2;
    const a = Math.atan2(dy, dx);
    const petal = Math.cos(a * petals + r * twist * Math.PI);
    const ring = Math.sin(r * rings * Math.PI);
    const t = (petal * 0.45 + ring * 0.35 + 1) / 2;
    const vignette = Math.max(0, 1 - r * 0.85);
    const c = rampAt(stops, t);
    return [c[0] * vignette, c[1] * vignette, c[2] * vignette];
  });
}

function interference(bmp: Bitmap, rng: Rng, stops: Rgb[]) {
  const sources = Array.from({ length: Math.floor(range(rng, 3, 6)) }, () => ({
    x: range(rng, 0.1, 0.9),
    y: range(rng, 0.1, 0.9),
    f: range(rng, 14, 34),
    p: range(rng, 0, Math.PI * 2),
  }));

  fill(bmp, (u, v) => {
    let sum = 0;
    for (const s of sources) {
      const d = Math.hypot(u - s.x, v - s.y);
      sum += Math.cos(d * s.f + s.p);
    }
    const t = (sum / sources.length + 1) / 2;
    return rampAt(stops, t);
  });
}

function voronoiShards(bmp: Bitmap, rng: Rng, stops: Rgb[]) {
  const sites = Array.from({ length: Math.floor(range(rng, 9, 22)) }, () => ({
    x: rng(),
    y: rng(),
    t: rng(),
  }));

  fill(bmp, (u, v) => {
    let best = Infinity;
    let second = Infinity;
    let bestT = 0;
    for (const s of sites) {
      const d = (u - s.x) * (u - s.x) + (v - s.y) * (v - s.y);
      if (d < best) {
        second = best;
        best = d;
        bestT = s.t;
      } else if (d < second) {
        second = d;
      }
    }
    // Bright seam where two cells are equidistant: gives crisp paper-cut edges.
    const edge = Math.sqrt(second) - Math.sqrt(best);
    const seam = Math.max(0, 1 - edge * 26);
    const c = rampAt(stops, bestT);
    const lift = 1 + seam * 0.9;
    return [c[0] * lift, c[1] * lift, c[2] * lift];
  });
}

function spiralArms(bmp: Bitmap, rng: Rng, stops: Rgb[]) {
  const arms = Math.floor(range(rng, 2, 6));
  const tightness = range(rng, 2.2, 5.5);
  const spin = range(rng, 0, Math.PI * 2);

  fill(bmp, (u, v) => {
    const dx = u - 0.5;
    const dy = (v - 0.5) * 0.95;
    const r = Math.sqrt(dx * dx + dy * dy) * 2;
    const a = Math.atan2(dy, dx) + spin;
    const swirl = Math.cos(a * arms - Math.log(r + 0.08) * tightness * Math.PI);
    const core = Math.exp(-r * 2.6);
    const t = Math.min(1, (swirl + 1) / 2 * (1 - r * 0.4) + core);
    const c = rampAt(stops, t);
    const glow = 1 + core * 1.4;
    return [c[0] * glow, c[1] * glow, c[2] * glow];
  });
}

function brushComposition(bmp: Bitmap, rng: Rng, stops: Rgb[]) {
  // Soft wash background so the strokes have something to sit on.
  const tilt = range(rng, -0.4, 0.4);
  fill(bmp, (u, v) => rampAt(stops, Math.min(1, Math.max(0, v * 0.75 + u * tilt * 0.5 + 0.05))));

  const { width: w, height: h } = bmp;
  const strokes = Math.floor(range(rng, 7, 16));

  for (let i = 0; i < strokes; i++) {
    const c = rampAt(stops, range(rng, 0.45, 1));
    strokeBezier(
      bmp,
      [range(rng, -0.1, 0.4) * w, range(rng, 0, 1) * h],
      [range(rng, 0.1, 0.6) * w, range(rng, -0.2, 1.2) * h],
      [range(rng, 0.4, 0.9) * w, range(rng, -0.2, 1.2) * h],
      [range(rng, 0.6, 1.1) * w, range(rng, 0, 1) * h],
      range(rng, 0.02, 0.09) * Math.min(w, h),
      c,
      range(rng, 0.5, 0.95)
    );
  }
  return;
}

function concentricBloom(bmp: Bitmap, rng: Rng, stops: Rgb[]) {
  const blobs = Array.from({ length: Math.floor(range(rng, 4, 9)) }, () => ({
    x: range(rng, 0.15, 0.85),
    y: range(rng, 0.15, 0.85),
    r: range(rng, 0.12, 0.4),
    rings: range(rng, 3, 9),
    t: rng(),
  }));

  fill(bmp, (u, v) => {
    let acc: Rgb = [0, 0, 0];
    let weight = 0.0001;
    for (const b of blobs) {
      const d = Math.hypot(u - b.x, v - b.y) / b.r;
      if (d > 1) continue;
      const ring = (Math.sin(d * b.rings * Math.PI) + 1) / 2;
      const w = (1 - d) * (1 - d);
      const c = rampAt(stops, b.t * 0.5 + ring * 0.5);
      acc = [acc[0] + c[0] * w, acc[1] + c[1] * w, acc[2] + c[2] * w];
      weight += w;
    }
    const base = rampAt(stops, 0.06);
    return [
      acc[0] / weight + base[0] * 0.35,
      acc[1] / weight + base[1] * 0.35,
      acc[2] / weight + base[2] * 0.35,
    ];
  });
}

const DRAW_STYLES = [
  flowRibbons,
  mandala,
  interference,
  voronoiShards,
  spiralArms,
  brushComposition,
  concentricBloom,
] as const;

export const DRAW_STYLE_NAMES = DRAW_STYLES.map((f) => f.name);

/** Renders one draw-mode artwork. Returns the buffer and the style used. */
export function renderDrawArtwork(
  seed: number,
  width: number,
  height: number
): { bitmap: Bitmap; style: string; palette: string } {
  const rng = makeRng(seed);
  const bmp = createBitmap(width, height);
  const palette = pick(rng, PALETTES);
  const style = pick(rng, DRAW_STYLES);

  style(bmp, rng, palette.stops);

  // A light grain breaks up the smooth gradients so the cube averages vary
  // slightly between neighbours rather than banding.
  const grain = 5;
  for (let i = 0; i < bmp.data.length; i++) {
    bmp.data[i] = clamp255(bmp.data[i] + (rng() - 0.5) * grain);
  }

  return { bitmap: bmp, style: style.name, palette: palette.name };
}

// ─── Text mode ───────────────────────────────────────────────────────────────

/**
 * 5x7 bitmap font. Written out as pixel rows so a glyph can be checked by eye.
 * Uppercase only, which suits the app's pixel aesthetic.
 */
const GLYPHS: Record<string, string[]> = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..##', '.####'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '..#..', '..#..', '..#..'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  ',': ['.....', '.....', '.....', '.....', '.##..', '.##..', '.#...'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  "'": ['..#..', '..#..', '.....', '.....', '.....', '.....', '.....'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  ':': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.....'],
  '&': ['.##..', '#..#.', '#.#..', '.#...', '#.#.#', '#..#.', '.##.#'],
  '/': ['....#', '...#.', '...#.', '..#..', '.#...', '.#...', '#....'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
};

const GLYPH_W = 5;
const GLYPH_H = 7;

function normalizeText(text: string): string {
  return text
    .toUpperCase()
    .split('')
    .map((ch) => (GLYPHS[ch] ? ch : GLYPHS[ch.toUpperCase()] ? ch.toUpperCase() : ' '))
    .join('');
}

/** Greedy word wrap measured in glyph cells. */
function wrapToColumns(text: string, maxCols: number): string[] {
  const out: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(' ')) {
      const candidate = line ? `${line} ${word}` : word;
      if (candidate.length <= maxCols) {
        line = candidate;
      } else {
        if (line) out.push(line);
        // Hard-split a word longer than the line.
        let rest = word;
        while (rest.length > maxCols) {
          out.push(rest.slice(0, maxCols));
          rest = rest.slice(maxCols);
        }
        line = rest;
      }
    }
    out.push(line);
  }
  return out;
}

/**
 * Renders white pixel text on black, mirroring Type mode: wrapped to fit and
 * scaled as large as the box allows, so short phrases fill the frame and longer
 * ones step down.
 */
export function renderTextArtwork(text: string, width: number, height: number): Bitmap {
  const bmp = createBitmap(width, height);
  const source = normalizeText(text);

  const maxW = width * 0.9;
  const maxH = height * 0.84;

  // Pick the largest cell size whose wrapped block still fits both axes.
  let best = { scale: 1, lines: [source], spacing: 1 };
  for (let scale = Math.floor(height / GLYPH_H); scale >= 1; scale--) {
    const advance = (GLYPH_W + 1) * scale;
    const maxCols = Math.max(1, Math.floor(maxW / advance));
    const lines = wrapToColumns(source, maxCols);
    const lineHeight = (GLYPH_H + 2) * scale;
    if (lines.length * lineHeight <= maxH) {
      best = { scale, lines, spacing: 1 };
      break;
    }
  }

  const { scale, lines } = best;
  const advance = (GLYPH_W + 1) * scale;
  const lineHeight = (GLYPH_H + 2) * scale;
  const blockH = lines.length * lineHeight;
  const startY = Math.round((height - blockH) / 2);

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const lineW = line.length * advance - scale;
    const startX = Math.round((width - lineW) / 2);
    const baseY = startY + li * lineHeight;

    for (let ci = 0; ci < line.length; ci++) {
      const glyph = GLYPHS[line[ci]] || GLYPHS[' '];
      const gx = startX + ci * advance;

      for (let gy = 0; gy < GLYPH_H; gy++) {
        const row = glyph[gy];
        for (let gxi = 0; gxi < GLYPH_W; gxi++) {
          if (row[gxi] !== '#') continue;
          // Stamp one font pixel as a scale x scale block.
          for (let py = 0; py < scale; py++) {
            for (let px = 0; px < scale; px++) {
              const x = gx + gxi * scale + px;
              const y = baseY + gy * scale + py;
              if (x < 0 || y < 0 || x >= width || y >= height) continue;
              const i = (y * width + x) * 3;
              bmp.data[i] = 255;
              bmp.data[i + 1] = 255;
              bmp.data[i + 2] = 255;
            }
          }
        }
      }
    }
  }

  return bmp;
}

// ─── Downsampling to a cube grid ─────────────────────────────────────────────

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
 * Averages a bitmap into per-cube colours.
 * Mirrors downsampleBoxFilter in src/lib/imageSampler.ts — gamma-correct box
 * filter plus the same per-mode tone curve.
 */
export function averageToGrid(
  bmp: Bitmap,
  cols: number,
  rows: number,
  contrast: ContrastMode
): Float32Array {
  const { width: srcW, height: srcH, data } = bmp;
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
      let count = 0;

      for (let y = startY; y < endY; y++) {
        const rowOffset = y * srcW;
        for (let x = startX; x < endX; x++) {
          const idx = (rowOffset + x) * 3;
          rSum += SRGB_TO_LINEAR[data[idx]];
          gSum += SRGB_TO_LINEAR[data[idx + 1]];
          bSum += SRGB_TO_LINEAR[data[idx + 2]];
          count++;
        }
      }

      const gridIdx = (r * cols + c) * 3;
      if (count === 0) continue;

      let rVal = linearToSrgb(rSum / count);
      let gVal = linearToSrgb(gSum / count);
      let bVal = linearToSrgb(bSum / count);

      if (contrast === 'draw') {
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
      } else if (contrast === 'type') {
        const gray = 0.2126 * rVal + 0.7152 * gVal + 0.0722 * bVal;
        const sigmoid = 1 / (1 + Math.exp(-14 * (gray - 0.55)));
        rVal = 0.10 + (0.97 - 0.10) * sigmoid;
        gVal = 0.10 + (0.96 - 0.10) * sigmoid;
        bVal = 0.10 + (0.95 - 0.10) * sigmoid;
      } else {
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

/** Grid dimensions that keep the source aspect with the long edge at maxDimension. */
export function fitGrid(aspect: number, maxDimension: number): { cols: number; rows: number } {
  if (!isFinite(aspect) || aspect <= 0) return { cols: maxDimension, rows: maxDimension };
  if (aspect >= 1) {
    return { cols: maxDimension, rows: Math.max(Math.round(maxDimension / aspect), 8) };
  }
  return { rows: maxDimension, cols: Math.max(Math.round(maxDimension * aspect), 8) };
}
