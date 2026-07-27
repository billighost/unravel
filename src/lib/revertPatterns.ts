/**
 * UNRAVEL V23 — CINEMATIC REVERT PATTERN LIBRARY
 *
 * 20 distinct stagger-pattern functions that control how cubes reassemble
 * during Revert. Each pattern takes a cube's grid position and returns a
 * normalised delay [0,1] (0 = animate first, 1 = animate last) and an
 * optional gather-point for path-modified reveals.
 *
 * All functions are pure — they receive grid metadata and return timing data
 * without side-effects, keeping patterns self-contained and swappable.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PatternResult {
  /** Normalised delay in [0, 1]. 0 = start first, 1 = start last. */
  delay: number;
  /** Optional waypoint the cube should route through before its final pos. */
  gatherPoint?: { x: number; y: number; z: number };
}

export type RevertPatternFn = (
  row: number,
  col: number,
  rows: number,
  cols: number,
) => PatternResult;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Simple 1-D hash noise for the Liquid Pour meniscus. */
function hashNoise(n: number): number {
  let x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Smooth interpolated 1-D noise (value noise). */
function smoothNoise1D(x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f); // smoothstep
  return hashNoise(i) * (1 - u) + hashNoise(i + 1) * u;
}

/** Normalise an array of raw values to [0, 1]. Mutates in-place. */
function normaliseDelays(delays: number[], count: number): void {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < count; i++) {
    if (delays[i] < min) min = delays[i];
    if (delays[i] > max) max = delays[i];
  }
  const range = max - min;
  if (range < 0.0001) {
    for (let i = 0; i < count; i++) delays[i] = 0;
    return;
  }
  for (let i = 0; i < count; i++) {
    delays[i] = (delays[i] - min) / range;
  }
}

// ---------------------------------------------------------------------------
// 1. Simultaneous (baseline — no stagger)
// ---------------------------------------------------------------------------
const simultaneous: RevertPatternFn = () => ({ delay: 0 });

// ---------------------------------------------------------------------------
// 2. Bottom-up fill
// ---------------------------------------------------------------------------
const bottomUpFill: RevertPatternFn = (row, _col, rows) => ({
  delay: rows > 1 ? (rows - 1 - row) / (rows - 1) : 0,
});

// ---------------------------------------------------------------------------
// 3. Top-down cascade
// ---------------------------------------------------------------------------
const topDownCascade: RevertPatternFn = (row, _col, rows) => ({
  delay: rows > 1 ? row / (rows - 1) : 0,
});

// ---------------------------------------------------------------------------
// 4. Left-to-right wipe
// ---------------------------------------------------------------------------
const leftToRightWipe: RevertPatternFn = (_row, col, _rows, cols) => ({
  delay: cols > 1 ? col / (cols - 1) : 0,
});

// ---------------------------------------------------------------------------
// 5. Right-to-left wipe
// ---------------------------------------------------------------------------
const rightToLeftWipe: RevertPatternFn = (_row, col, _rows, cols) => ({
  delay: cols > 1 ? (cols - 1 - col) / (cols - 1) : 0,
});

// ---------------------------------------------------------------------------
// 6. Center-out bloom
// ---------------------------------------------------------------------------
const centerOutBloom: RevertPatternFn = (row, col, rows, cols) => {
  const cr = (rows - 1) / 2;
  const cc = (cols - 1) / 2;
  const dr = row - cr;
  const dc = col - cc;
  const maxDist = Math.sqrt(cr * cr + cc * cc) || 1;
  return { delay: Math.sqrt(dr * dr + dc * dc) / maxDist };
};

// ---------------------------------------------------------------------------
// 7. Outside-in converge
// ---------------------------------------------------------------------------
const outsideInConverge: RevertPatternFn = (row, col, rows, cols) => {
  const r = centerOutBloom(row, col, rows, cols);
  return { delay: 1 - r.delay };
};

// ---------------------------------------------------------------------------
// 8. Spiral clockwise
// ---------------------------------------------------------------------------
const spiralClockwise: RevertPatternFn = (row, col, rows, cols) => {
  const cr = (rows - 1) / 2;
  const cc = (cols - 1) / 2;
  // atan2 with Y inverted for screen coords → clockwise sweep
  let angle = Math.atan2(-(row - cr), col - cc); // range [-PI, PI]
  if (angle < 0) angle += Math.PI * 2;
  return { delay: angle / (Math.PI * 2) };
};

// ---------------------------------------------------------------------------
// 9. Spiral counter-clockwise
// ---------------------------------------------------------------------------
const spiralCounterClockwise: RevertPatternFn = (row, col, rows, cols) => {
  const r = spiralClockwise(row, col, rows, cols);
  return { delay: 1 - r.delay };
};

// ---------------------------------------------------------------------------
// 10. Diagonal sweep (top-left → bottom-right)
// ---------------------------------------------------------------------------
const diagonalSweepTLBR: RevertPatternFn = (row, col, rows, cols) => {
  const maxDiag = (rows - 1) + (cols - 1);
  return { delay: maxDiag > 0 ? (row + col) / maxDiag : 0 };
};

// ---------------------------------------------------------------------------
// 11. Diagonal sweep (bottom-right → top-left)
// ---------------------------------------------------------------------------
const diagonalSweepBRTL: RevertPatternFn = (row, col, rows, cols) => {
  const r = diagonalSweepTLBR(row, col, rows, cols);
  return { delay: 1 - r.delay };
};

// ---------------------------------------------------------------------------
// 12. Random scatter (twinkle)
// ---------------------------------------------------------------------------
const randomScatter: RevertPatternFn = () => ({
  delay: Math.random(),
});

// ---------------------------------------------------------------------------
// 13. Liquid pour
//     Bottom-up fill with noise-perturbed meniscus + slight extra bounce.
//     The key difference from #2 is the wavy, organic fill-line shape.
// ---------------------------------------------------------------------------
const liquidPour: RevertPatternFn = (row, col, rows, cols) => {
  // Invert row so bottom = 0
  const invertedRow = rows - 1 - row;
  // Noise-perturbed fill line: column position drives the noise
  const noiseAmplitude = Math.max(1.5, rows * 0.12);
  const noiseFreq = 2.5; // waves across the width
  const noise = smoothNoise1D(col * noiseFreq / Math.max(cols - 1, 1)) * 2 - 1; // [-1, 1]
  const adjustedRow = invertedRow + noise * noiseAmplitude;
  // Normalise will handle the final [0, 1] mapping
  // We return raw value; the batch normaliser in CubePhysicsEngine handles it
  return { delay: adjustedRow };
};

// ---------------------------------------------------------------------------
// 14. Horizontal unfurl (blinds)
// ---------------------------------------------------------------------------
const horizontalUnfurl: RevertPatternFn = (_row, col, _rows, cols) => {
  const center = (cols - 1) / 2;
  const maxDist = center || 1;
  return { delay: Math.abs(col - center) / maxDist };
};

// ---------------------------------------------------------------------------
// 15. Vertical unfurl
// ---------------------------------------------------------------------------
const verticalUnfurl: RevertPatternFn = (row, _col, rows) => {
  const center = (rows - 1) / 2;
  const maxDist = center || 1;
  return { delay: Math.abs(row - center) / maxDist };
};

// ---------------------------------------------------------------------------
// 16. Zipper merge
//     Left and right halves both sweep toward the center simultaneously.
// ---------------------------------------------------------------------------
const zipperMerge: RevertPatternFn = (_row, col, _rows, cols) => {
  const center = (cols - 1) / 2;
  // Distance from each cube to the center, but within its own half
  // Both halves start from the outer edge and meet at center
  const distFromEdge =
    col <= center
      ? center - col   // left half: far-left is largest delay
      : col - center;  // right half: far-right is largest delay
  const maxDist = center || 1;
  return { delay: distFromEdge / maxDist };
};

// ---------------------------------------------------------------------------
// 17. Wave ripple
//     Sine-modulated distance from center creating concentric ring wavefronts.
// ---------------------------------------------------------------------------
const waveRipple: RevertPatternFn = (row, col, rows, cols) => {
  const cr = (rows - 1) / 2;
  const cc = (cols - 1) / 2;
  const dr = row - cr;
  const dc = col - cc;
  const dist = Math.sqrt(dr * dr + dc * dc);
  const maxDist = Math.sqrt(cr * cr + cc * cc) || 1;
  const normDist = dist / maxDist;

  // Sine modulation creates 3-4 visible ring wavefronts
  const ringFreq = 3.5;
  const modulated = normDist + 0.15 * Math.sin(normDist * ringFreq * Math.PI * 2);

  return { delay: modulated };
};

// ---------------------------------------------------------------------------
// 18. Row-by-row random order
// ---------------------------------------------------------------------------

// We use a module-level shuffled row order that gets regenerated each time
// the batch compute function is called (see computePatternDelays below).
// The pattern function itself uses a pre-built lookup.
let _rowOrder: number[] = [];

const rowByRowRandom: RevertPatternFn = (row, _col, rows) => {
  // _rowOrder is populated before this function is called in batch
  if (_rowOrder.length !== rows) return { delay: Math.random() };
  return { delay: rows > 1 ? _rowOrder[row] / (rows - 1) : 0 };
};

// ---------------------------------------------------------------------------
// 19. Column-by-column random order
// ---------------------------------------------------------------------------
let _colOrder: number[] = [];

const colByColRandom: RevertPatternFn = (_row, col, _rows, cols) => {
  if (_colOrder.length !== cols) return { delay: Math.random() };
  return { delay: cols > 1 ? _colOrder[col] / (cols - 1) : 0 };
};

// ---------------------------------------------------------------------------
// 20. Convergent gather
//     Cubes route through a gather point (bottom-center) before snapping
//     to their final position. Delay is based on distance from gather point.
// ---------------------------------------------------------------------------
const convergentGather: RevertPatternFn = (row, col, rows, cols) => {
  // Gather point: bottom-center of the grid
  const gatherRow = rows - 1;
  const gatherCol = (cols - 1) / 2;
  const dr = row - gatherRow;
  const dc = col - gatherCol;
  const dist = Math.sqrt(dr * dr + dc * dc);
  const maxDist = Math.sqrt((rows - 1) * (rows - 1) + gatherCol * gatherCol) || 1;

  return {
    delay: dist / maxDist,
    gatherPoint: { x: 0, y: 0, z: 0 }, // placeholder; actual world coords set in engine
  };
};

// ---------------------------------------------------------------------------
// Pattern registry
// ---------------------------------------------------------------------------

export const REVERT_PATTERNS: RevertPatternFn[] = [
  simultaneous,           //  0 — #1
  bottomUpFill,           //  1 — #2
  topDownCascade,         //  2 — #3
  leftToRightWipe,        //  3 — #4
  rightToLeftWipe,        //  4 — #5
  centerOutBloom,         //  5 — #6
  outsideInConverge,      //  6 — #7
  spiralClockwise,        //  7 — #8
  spiralCounterClockwise, //  8 — #9
  diagonalSweepTLBR,      //  9 — #10
  diagonalSweepBRTL,      // 10 — #11
  randomScatter,          // 11 — #12
  liquidPour,             // 12 — #13
  horizontalUnfurl,       // 13 — #14
  verticalUnfurl,         // 14 — #15
  zipperMerge,            // 15 — #16
  waveRipple,             // 16 — #17
  rowByRowRandom,         // 17 — #18
  colByColRandom,         // 18 — #19
  convergentGather,       // 19 — #20
];

export const PATTERN_NAMES: string[] = [
  'Simultaneous',
  'Bottom-up Fill',
  'Top-down Cascade',
  'Left-to-right Wipe',
  'Right-to-left Wipe',
  'Center-out Bloom',
  'Outside-in Converge',
  'Spiral Clockwise',
  'Spiral Counter-clockwise',
  'Diagonal Sweep TL→BR',
  'Diagonal Sweep BR→TL',
  'Random Scatter (Twinkle)',
  'Liquid Pour',
  'Horizontal Unfurl',
  'Vertical Unfurl',
  'Zipper Merge',
  'Wave Ripple',
  'Row-by-row Random',
  'Column-by-column Random',
  'Convergent Gather',
];

// ---------------------------------------------------------------------------
// Pattern selector (prevents immediate repeats)
// ---------------------------------------------------------------------------

export function selectRevertPattern(lastIndex: number | null): number {
  const total = REVERT_PATTERNS.length;
  if (total <= 1) return 0;

  let idx: number;
  do {
    idx = Math.floor(Math.random() * total);
  } while (idx === lastIndex);

  return idx;
}

// ---------------------------------------------------------------------------
// Batch delay computation
// ---------------------------------------------------------------------------

/**
 * Computes normalised delays for every cube in the grid using the given
 * pattern index. Writes results into the provided Float32Array (length N).
 * Returns true if the pattern uses gather-points (path modification).
 *
 * This is called once at Revert trigger time (not per-frame).
 */
export function computePatternDelays(
  patternIndex: number,
  rows: number,
  cols: number,
  outDelays: Float32Array,
  outGatherPoints: Float32Array | null,
): boolean {
  const pattern = REVERT_PATTERNS[patternIndex] || simultaneous;
  const totalCubes = rows * cols;
  let hasGatherPoints = false;

  // Pre-generate shuffled row/col orders for patterns #18/#19
  if (patternIndex === 17) {
    // Row-by-row random: create shuffled row indices
    _rowOrder = Array.from({ length: rows }, (_, i) => i);
    for (let i = rows - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [_rowOrder[i], _rowOrder[j]] = [_rowOrder[j], _rowOrder[i]];
    }
  } else if (patternIndex === 18) {
    // Col-by-col random: create shuffled column indices
    _colOrder = Array.from({ length: cols }, (_, i) => i);
    for (let i = cols - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [_colOrder[i], _colOrder[j]] = [_colOrder[j], _colOrder[i]];
    }
  }

  // Temporary raw delays for patterns that need normalisation
  const rawDelays: number[] = new Array(totalCubes);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const result = pattern(r, c, rows, cols);
      rawDelays[i] = result.delay;

      if (result.gatherPoint && outGatherPoints) {
        hasGatherPoints = true;
        // Store the gather-point flag; actual world coords set by engine
        const i3 = i * 3;
        outGatherPoints[i3] = 1; // flag: has gather point
        outGatherPoints[i3 + 1] = 0;
        outGatherPoints[i3 + 2] = 0;
      }
    }
  }

  // Normalise delays to [0, 1]
  normaliseDelays(rawDelays, totalCubes);

  // Write to typed array
  for (let i = 0; i < totalCubes; i++) {
    outDelays[i] = rawDelays[i];
  }

  return hasGatherPoints;
}
