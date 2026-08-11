/**
 * UNRAVEL BROAD-PHASE SPATIAL HASH
 *
 * A fixed-capacity, allocation-free uniform spatial hash for cube-vs-cube
 * collision queries.
 *
 * The previous engine only ever compared a cube against its eight *grid-index*
 * neighbours. That works while cubes sit in their original lattice, but the
 * moment a cube flies across the canvas its grid neighbours are somewhere else
 * entirely, so it passed straight through every cube in its path. This structure
 * indexes cubes by where they actually are in world space, so any cube can
 * collide with any other cube it genuinely touches.
 *
 * Build is a counting sort over cell buckets: two passes, zero allocation after
 * construction, safe to run every frame over the full cube set.
 */

const HASH_X = 73856093;
const HASH_Y = 19349663;
const HASH_Z = 83492791;

export class SpatialHash {
  private readonly capacity: number;
  private readonly tableSize: number;
  private cellSize: number;
  private invCellSize: number;

  /** Bucket start offsets (prefix sums), length tableSize + 1. */
  private cellStart: Int32Array;
  /** Scratch write cursor per bucket. */
  private cellCursor: Int32Array;
  /** Cube indices grouped by bucket. */
  private entries: Int32Array;

  constructor(capacity: number, cellSize: number) {
    this.capacity = Math.max(1, capacity);
    // Table sized well above capacity keeps buckets short; power of two so the
    // modulo reduces to a mask.
    let size = 1;
    while (size < this.capacity * 2) size <<= 1;
    this.tableSize = Math.max(size, 64);

    this.cellSize = cellSize > 0 ? cellSize : 1;
    this.invCellSize = 1 / this.cellSize;

    this.cellStart = new Int32Array(this.tableSize + 1);
    this.cellCursor = new Int32Array(this.tableSize);
    this.entries = new Int32Array(this.capacity);
  }

  public setCellSize(cellSize: number) {
    this.cellSize = cellSize > 0 ? cellSize : 1;
    this.invCellSize = 1 / this.cellSize;
  }

  /** Maps a world-space cell coordinate triple to a bucket index. */
  public hashCell(cx: number, cy: number, cz: number): number {
    // XOR of large-prime multiples, masked into the table. The `>>> 0` keeps the
    // intermediate unsigned so the mask yields a valid positive index.
    const h = (((cx * HASH_X) ^ (cy * HASH_Y) ^ (cz * HASH_Z)) >>> 0) & (this.tableSize - 1);
    return h;
  }

  public cellCoord(v: number): number {
    return Math.floor(v * this.invCellSize);
  }

  /**
   * Rebuilds the index over `count` cubes read from a packed xyz position array.
   */
  public build(positions: Float32Array, count: number) {
    const n = Math.min(count, this.capacity);
    const start = this.cellStart;
    const cursor = this.cellCursor;

    start.fill(0);

    // Pass 1: count per bucket (offset by one so we can prefix-sum in place).
    for (let i = 0; i < n; i++) {
      const i3 = i * 3;
      const h = this.hashCell(
        this.cellCoord(positions[i3]),
        this.cellCoord(positions[i3 + 1]),
        this.cellCoord(positions[i3 + 2])
      );
      start[h + 1]++;
    }

    // Prefix sum into bucket start offsets.
    for (let b = 0; b < this.tableSize; b++) {
      start[b + 1] += start[b];
      cursor[b] = start[b];
    }

    // Pass 2: scatter cube indices into their buckets.
    for (let i = 0; i < n; i++) {
      const i3 = i * 3;
      const h = this.hashCell(
        this.cellCoord(positions[i3]),
        this.cellCoord(positions[i3 + 1]),
        this.cellCoord(positions[i3 + 2])
      );
      this.entries[cursor[h]++] = i;
    }
  }

  /** First entry offset of a bucket. */
  public bucketStart(hash: number): number {
    return this.cellStart[hash];
  }

  /** One-past-last entry offset of a bucket. */
  public bucketEnd(hash: number): number {
    return this.cellStart[hash + 1];
  }

  /** Cube index stored at an entry offset. */
  public entryAt(offset: number): number {
    return this.entries[offset];
  }
}
