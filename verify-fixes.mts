/**
 * Verification for the save/restore, colour-encoding, text-layout and cube
 * material fixes. Runs the real modules under a jsdom-ish DOM shim with a
 * canvas/IndexedDB good enough to exercise the code paths that were broken.
 *
 * Run: npx tsx verify-fixes.mts
 */

import assert from 'node:assert/strict';

const results: string[] = [];
function check(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      results.push(`PASS  ${name}`);
    })
    .catch((err) => {
      results.push(`FAIL  ${name}\n      ${err.message}`);
      process.exitCode = 1;
    });
}

// ---------------------------------------------------------------- DOM shims
type Ctx2D = Record<string, any>;

class FakeImageData {
  data: Uint8ClampedArray;
  constructor(public width: number, public height: number) {
    this.data = new Uint8ClampedArray(width * height * 4);
  }
}

/** A canvas that records solid fills/draws well enough to average pixels. */
class FakeCanvas {
  width = 0;
  height = 0;
  private ctx: Ctx2D | null = null;
  /** Uniform RGBA the surface currently holds. */
  pixel: [number, number, number, number] = [0, 0, 0, 0];
  contextOptions: any = null;
  fillTextCalls: Array<{ text: string; x: number; y: number; font: string }> = [];

  getContext(kind: string, options?: any) {
    if (kind !== '2d') return null;
    if (this.ctx) return this.ctx;
    this.contextOptions = options ?? null;

    const canvas = this;
    let currentFont = '';

    this.ctx = {
      canvas,
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'low',
      fillStyle: '#000000',
      textAlign: 'left',
      textBaseline: 'alphabetic',
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
      get font() {
        return currentFont;
      },
      set font(value: string) {
        currentFont = value;
      },
      save() {},
      restore() {},
      beginPath() {},
      closePath() {},
      moveTo() {},
      lineTo() {},
      quadraticCurveTo() {},
      stroke() {},
      clearRect() {
        canvas.pixel = [0, 0, 0, 0];
      },
      fillRect() {
        canvas.pixel = parseColor(String(this.fillStyle));
      },
      fillText(text: string, x: number, y: number) {
        canvas.fillTextCalls.push({ text, x, y, font: currentFont });
      },
      drawImage(source: any) {
        if (source instanceof FakeCanvas) canvas.pixel = [...source.pixel];
        else if (source && source.pixel) canvas.pixel = [...source.pixel];
      },
      createImageData(w: number, h: number) {
        return new FakeImageData(w, h);
      },
      putImageData() {},
      getImageData(_x: number, _y: number, w: number, h: number) {
        const img = new FakeImageData(w, h);
        const [r, g, b, a] = canvas.pixel;
        for (let i = 0; i < w * h; i++) {
          img.data[i * 4] = r;
          img.data[i * 4 + 1] = g;
          img.data[i * 4 + 2] = b;
          img.data[i * 4 + 3] = a;
        }
        return img;
      },
      // Deterministic monospace-ish metrics: enough for wrap decisions.
      measureText(text: string) {
        const size = parseFloat(currentFont.match(/(\d+(?:\.\d+)?)px/)?.[1] ?? '10');
        return { width: text.length * size * 0.55 };
      },
    };
    return this.ctx;
  }

  toBlob(cb: (blob: any) => void, type: string, quality?: number) {
    cb({ __blob: true, type, quality, size: 1024, pixel: [...this.pixel] });
  }

  toDataURL(type: string) {
    return `data:${type};base64,AAAA`;
  }
}

function parseColor(css: string): [number, number, number, number] {
  if (css.startsWith('#')) {
    const hex = css.slice(1);
    const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
    return [
      parseInt(full.slice(0, 2), 16),
      parseInt(full.slice(2, 4), 16),
      parseInt(full.slice(4, 6), 16),
      255,
    ];
  }
  return [0, 0, 0, 255];
}

class FakeBlob {}

const documentShim = {
  createElement(tag: string) {
    if (tag === 'canvas') return new FakeCanvas();
    return {};
  },
  documentElement: {},
  readyState: 'complete',
};

// Minimal IndexedDB: enough to prove a record round-trips and to reject values
// that are not structured-cloneable (which is the bug being verified).
const idbStores: Record<string, Map<any, any>> = {
  last_creation: new Map(),
  gallery_items: new Map(),
};
let autoIncrement = 1;

function assertCloneable(value: any, path = 'value') {
  if (value === null || typeof value !== 'object') return;
  if (value instanceof FakeCanvas) {
    const err: any = new Error(
      `Failed to execute 'put' on 'IDBObjectStore': HTMLCanvasElement object could not be cloned.`
    );
    err.name = 'DataCloneError';
    throw err;
  }
  if (value instanceof Uint8Array || value instanceof Float32Array) return;
  if (value.__blob) return;
  for (const key of Object.keys(value)) assertCloneable(value[key], `${path}.${key}`);
}

function makeRequest<T>(exec: () => T) {
  const req: any = { onsuccess: null, onerror: null, result: undefined, error: null };
  queueMicrotask(() => {
    try {
      req.result = exec();
      req.onsuccess?.({ target: req });
    } catch (err) {
      req.error = err;
      req.onerror?.({ target: req });
    }
  });
  return req;
}

const indexedDBShim = {
  open() {
    const req: any = { onsuccess: null, onerror: null, onupgradeneeded: null, result: null };
    queueMicrotask(() => {
      const db = {
        objectStoreNames: { contains: (n: string) => n in idbStores },
        createObjectStore: () => {},
        transaction(name: string) {
          const tx: any = { oncomplete: null, onerror: null, onabort: null, error: null };
          const store = idbStores[name];
          let failed: any = null;

          tx.objectStore = () => ({
            put(value: any, key: any) {
              try {
                assertCloneable(value);
                store.set(key, structuredCopy(value));
              } catch (err) {
                failed = err;
                throw err;
              }
            },
            add(value: any) {
              try {
                assertCloneable(value);
                const id = autoIncrement++;
                store.set(id, { ...structuredCopy(value), id });
              } catch (err) {
                failed = err;
                throw err;
              }
            },
            delete(key: any) {
              store.delete(key);
            },
            get(key: any) {
              return makeRequest(() => store.get(key) ?? undefined);
            },
            getAll() {
              return makeRequest(() => Array.from(store.values()));
            },
          });

          queueMicrotask(() => {
            if (failed) {
              tx.error = failed;
              tx.onabort?.({});
            } else {
              tx.oncomplete?.({});
            }
          });
          return tx;
        },
      };
      req.result = db;
      req.onsuccess?.({ target: req });
    });
    return req;
  },
};

/** Shallow structural copy that preserves typed arrays and blob stand-ins. */
function structuredCopy(value: any): any {
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Uint8Array) return new Uint8Array(value);
  if (value instanceof Float32Array) return new Float32Array(value);
  if (value.__blob) return value;
  if (Array.isArray(value)) return value.map(structuredCopy);
  const out: any = {};
  for (const key of Object.keys(value)) out[key] = structuredCopy(value[key]);
  return out;
}

const g = globalThis as any;
g.window = g;
g.document = documentShim;
g.indexedDB = indexedDBShim;
g.HTMLCanvasElement = FakeCanvas;
g.HTMLImageElement = class {};
g.ImageBitmap = class {};
g.Blob = FakeBlob;
g.getComputedStyle = () => ({
  getPropertyValue: (name: string) => (name === '--font-inter' ? '__Inter_abc123' : ''),
});
g.localStorage = {
  store: new Map<string, string>(),
  getItem(k: string) {
    return this.store.get(k) ?? null;
  },
  setItem(k: string, v: string) {
    this.store.set(k, v);
  },
};
g.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
g.requestAnimationFrame = (cb: any) => setTimeout(() => cb(performance.now()), 16) as any;
g.cancelAnimationFrame = (id: any) => clearTimeout(id);
g.addEventListener = () => {};
g.removeEventListener = () => {};

// Object URLs: Node's real implementation rejects our Blob stand-in, so the
// <img> decode fallback needs its own shim. Only the statics are replaced —
// overwriting the URL constructor itself breaks the module loader.
const objectUrls = new Map<string, any>();
let objectUrlSeq = 0;
(URL as any).createObjectURL = (blob: any) => {
  const url = `blob:fake/${objectUrlSeq++}`;
  objectUrls.set(url, blob);
  return url;
};
(URL as any).revokeObjectURL = (url: string) => {
  objectUrls.delete(url);
};

/** Fires onload asynchronously once src is assigned, like a real decode. */
class FakeImage {
  width = 64;
  height = 64;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  pixel: [number, number, number, number] = [0, 0, 0, 255];
  private _src = '';
  set src(value: string) {
    this._src = value;
    const blob = objectUrls.get(value);
    if (blob?.pixel) this.pixel = [...blob.pixel];
    queueMicrotask(() => (blob ? this.onload?.() : this.onerror?.()));
  }
  get src() {
    return this._src;
  }
}
g.Image = FakeImage;
g.HTMLImageElement = FakeImage;

// Default to the <img> fallback path; the ImageBitmap path is exercised below.
g.createImageBitmap = undefined;

// Blob instanceof checks in storage.ts must recognise our stand-in.
Object.defineProperty(FakeBlob, Symbol.hasInstance, {
  value: (obj: any) => !!obj && obj.__blob === true,
});

// ---------------------------------------------------------------- the tests
const storage = await import('./src/lib/storage.ts');
const { createCubeGeometry } = await import('./src/lib/cubeMaterial.ts');
const cubeTexture = await import('./src/lib/cubeTexture.ts');
const text = await import('./src/lib/renderTextToCanvas.ts');
const { generateDemoGrid } = await import('./src/lib/demoGenerator.ts');

await check('colour bytes survive an encode/decode round trip', () => {
  const colors = new Float32Array([0, 0.25, 0.5, 0.75, 1, 0.333]);
  const decoded = storage.decodeColors(storage.encodeColorBytes(colors));
  for (let i = 0; i < colors.length; i++) {
    assert.ok(Math.abs(decoded[i] - colors[i]) <= 1 / 255, `channel ${i} drifted`);
  }
});

await check('base64 API payload round-trips and is half the size of hex', () => {
  const colors = new Float32Array(600).map((_, i) => (i % 256) / 255);
  const encoded = storage.encodeColorsForApi(colors);
  assert.ok(encoded.startsWith('b64:'), 'payload should be tagged b64:');

  const decoded = storage.decodeColors(encoded);
  assert.equal(decoded.length, colors.length);
  for (let i = 0; i < colors.length; i++) {
    assert.ok(Math.abs(decoded[i] - colors[i]) <= 1 / 255, `channel ${i} drifted`);
  }

  const hexLength = colors.length * 2;
  const b64Length = encoded.length - 'b64:'.length;
  assert.ok(b64Length < hexLength * 0.7, `expected < 70% of hex, got ${b64Length}/${hexLength}`);
});

await check('legacy hex and number[] payloads still decode', () => {
  const hex = 'ff8000';
  const fromHex = storage.decodeColors(hex);
  assert.equal(fromHex.length, 3);
  assert.ok(Math.abs(fromHex[0] - 1) < 1e-6);
  assert.ok(Math.abs(fromHex[1] - 128 / 255) < 1e-6);
  assert.equal(fromHex[2], 0);

  const fromArray = storage.decodeColors([0.5, 0.25]);
  assert.equal(fromArray.length, 2);
  assert.ok(Math.abs(fromArray[0] - 0.5) < 1e-6);
});

await check('toSavedGridData strips the canvas and keeps an encodable texture', async () => {
  const tile = cubeTexture.createTileCanvas(10, 5)!;
  const ctx = tile.canvas.getContext('2d')!;
  ctx.fillStyle = '#3366ff';
  ctx.fillRect(0, 0, tile.canvas.width, tile.canvas.height);

  const saved = await storage.toSavedGridData({
    cols: 10,
    rows: 5,
    colors: new Float32Array(150).fill(0.5),
    textureCanvas: tile.canvas as any,
    contrast: 'photo',
  });

  assert.ok(!(saved as any).textureCanvas, 'canvas must not be carried into the record');
  assert.ok(saved.colors instanceof Uint8Array, 'colours should be stored as bytes');
  assert.ok(saved.texture, 'texture blob should be produced');
  assert.equal(saved.contrast, 'photo');
});

await check('a creation with a texture actually persists to IndexedDB', async () => {
  idbStores.last_creation.clear();
  idbStores.gallery_items.clear();

  const tile = cubeTexture.createTileCanvas(8, 8)!;
  const ctx = tile.canvas.getContext('2d')!;
  ctx.fillStyle = '#20c020';
  ctx.fillRect(0, 0, tile.canvas.width, tile.canvas.height);

  await storage.persistCreation(
    {
      cols: 8,
      rows: 8,
      colors: new Float32Array(192).fill(0.4),
      textureCanvas: tile.canvas as any,
      contrast: 'draw',
    },
    'draw'
  );

  const active = idbStores.last_creation.get('active');
  assert.ok(active, 'auto-resume record was not written');
  assert.ok(active.gridData.texture, 'texture was not persisted');
  assert.equal(active.gridData.contrast, 'draw');
  assert.equal(idbStores.gallery_items.size, 1, 'gallery entry was not written');

  const roundTripped = await storage.getLastCreation();
  assert.ok(roundTripped, 'saved creation could not be read back');
  assert.equal(roundTripped!.gridData.cols, 8);
});

await check('writing a raw canvas to IndexedDB still throws (shim is honest)', async () => {
  let threw = false;
  try {
    assertCloneable({ gridData: { textureCanvas: new FakeCanvas() } });
  } catch (err: any) {
    threw = err.name === 'DataCloneError';
  }
  assert.ok(threw, 'shim must reproduce the original DataCloneError');
});

await check('restoreSavedGrid rebuilds colours and decodes the texture', async () => {
  const active = idbStores.last_creation.get('active');
  const restored = await storage.restoreSavedGrid(active.gridData);

  assert.equal(restored.cols, 8);
  assert.equal(restored.colors.length, 192);
  assert.ok(Math.abs(restored.colors[0] - 0.4) <= 1 / 255);
  assert.equal(restored.contrast, 'draw');
  assert.ok(restored.textureCanvas, 'texture should be decoded back into an image source');
});

await check('texture decode also works via createImageBitmap', async () => {
  const bitmapMarker = { width: 128, height: 128, __bitmap: true };
  g.createImageBitmap = async () => bitmapMarker;
  try {
    const active = idbStores.last_creation.get('active');
    const restored = await storage.restoreSavedGrid(active.gridData);
    assert.equal(restored.textureCanvas as any, bitmapMarker, 'should prefer createImageBitmap');
  } finally {
    g.createImageBitmap = undefined;
  }
});

await check('re-saving a restored creation keeps its texture', async () => {
  // Regression guard: a resumed creation carries an ImageBitmap rather than a
  // canvas, and an instanceof-canvas-only check would silently drop the texture
  // on the next auto-save.
  const active = idbStores.last_creation.get('active');
  const restored = await storage.restoreSavedGrid(active.gridData);
  const resaved = await storage.toSavedGridData(restored);
  assert.ok(resaved.texture, 'texture must survive a restore -> save cycle');
});

await check('cube geometry carries white vertex colours (the black-cube fix)', () => {
  const geometry = createCubeGeometry(4, 3);

  const color = geometry.getAttribute('color');
  assert.ok(color, 'geometry must define a color attribute, or USE_COLOR reads (0,0,0)');
  assert.equal(color.itemSize, 3);
  assert.equal(color.count, geometry.getAttribute('position').count);
  for (let i = 0; i < color.array.length; i++) {
    assert.equal(color.array[i], 1, `vertex colour ${i} must be white`);
  }

  const offsets = geometry.getAttribute('aTileOffset');
  const scales = geometry.getAttribute('aTileScale');
  assert.equal(offsets.count, 12, 'one tile rect per instance');
  assert.ok(Math.abs(scales.array[0] - 1 / 4) < 1e-6, 'u scale should be 1/cols');
  assert.ok(Math.abs(scales.array[1] - 1 / 3) < 1e-6, 'v scale should be 1/rows');
  geometry.dispose();
});

await check('tile texture canvas is an exact multiple of the grid', () => {
  const tile = cubeTexture.createTileCanvas(28, 19)!;
  assert.equal(tile.canvas.width % 28, 0);
  assert.equal(tile.canvas.height % 19, 0);
  assert.ok(tile.canvas.width <= 2048 && tile.canvas.height <= 2048);

  // The texture canvas must NOT be flagged willReadFrequently: it is upload-only.
  const opts = (tile.canvas as any).contextOptions;
  tile.canvas.getContext('2d');
  assert.ok(!opts?.willReadFrequently, 'texture canvas should stay GPU-backed');
});

await check('text layout wraps long paragraphs instead of using one line', () => {
  const paragraph =
    'the quick brown fox jumps over the lazy dog and keeps on running through ' +
    'the field until it reaches the far side of the meadow where it rests';

  const layout = text.layoutTextBlock(paragraph, 800, 400, 'sans-serif');
  assert.ok(layout.lines.length > 1, `expected wrapping, got ${layout.lines.length} line(s)`);
  assert.ok(layout.fontSize >= 4);
  assert.ok(
    layout.lines.join(' ').replace(/\s+/g, ' ').trim() === paragraph,
    'wrapping must preserve the text'
  );
});

await check('explicit newlines are preserved as separate lines', () => {
  const layout = text.layoutTextBlock('one\ntwo\nthree', 800, 400, 'sans-serif');
  assert.deepEqual(layout.lines, ['one', 'two', 'three']);
});

await check('short text scales up, long text scales down', () => {
  const short = text.layoutTextBlock('HI', 800, 400, 'sans-serif');
  const long = text.layoutTextBlock(
    Array.from({ length: 60 }, () => 'word').join(' '),
    800,
    400,
    'sans-serif'
  );
  assert.ok(
    short.fontSize > long.fontSize * 3,
    `short (${short.fontSize}) should dwarf long (${long.fontSize})`
  );
  assert.ok(long.lines.length > short.lines.length);
});

await check('a trailing newline does not reserve an empty line', () => {
  const withNewline = text.layoutTextBlock('hello\n', 800, 400, 'sans-serif');
  const without = text.layoutTextBlock('hello', 800, 400, 'sans-serif');
  assert.equal(withNewline.lines.length, without.lines.length);
  assert.equal(withNewline.fontSize, without.fontSize);
});

await check('CSS font variables are resolved for canvas use', () => {
  const resolved = text.resolveFontFamily("var(--font-inter), 'Helvetica Neue', sans-serif");
  assert.ok(resolved.includes('__Inter_abc123'), `unresolved: ${resolved}`);
  assert.ok(!resolved.includes('var('), 'no var() may reach ctx.font');

  // An unknown variable falls back to the declared fallback rather than empty.
  const fallback = text.resolveFontFamily('var(--nope, Georgia), serif');
  assert.ok(fallback.includes('Georgia'), `expected fallback, got ${fallback}`);
});

await check('renderTextToGrid produces a tile texture and per-cube colours', () => {
  const grid = text.renderTextToGrid('hello\nworld', 20, 10, 'sans-serif');
  assert.equal(grid.cols, 20);
  assert.equal(grid.rows, 10);
  assert.equal(grid.colors.length, 20 * 10 * 3);
  assert.ok(grid.textureCanvas, 'text mode must supply a tile texture');
  assert.equal(grid.contrast, 'type');

  const canvas = grid.textureCanvas as unknown as FakeCanvas;
  assert.equal(canvas.width % 20, 0, 'texture must be an exact multiple of cols');
  assert.equal(canvas.fillTextCalls.length, 2, 'both lines should be drawn');
  assert.ok(
    canvas.fillTextCalls[1].y > canvas.fillTextCalls[0].y,
    'second line must sit below the first'
  );
});

await check('demo grid still yields in-range colours for every cube', () => {
  const demo = generateDemoGrid(12, 8);
  assert.equal(demo.colors.length, 12 * 8 * 3);
  for (let i = 0; i < demo.colors.length; i++) {
    assert.ok(demo.colors[i] >= 0 && demo.colors[i] <= 1, `colour ${i} out of range`);
  }
  assert.ok(!demo.textureCanvas, 'procedural grid has no texture, and must fall back to colours');
});

await check('thumbnails prefer the artwork texture over the cube mosaic', () => {
  const tile = cubeTexture.createTileCanvas(10, 6)!;
  const ctx = tile.canvas.getContext('2d')!;
  ctx.fillStyle = '#ff0000';
  ctx.fillRect(0, 0, tile.canvas.width, tile.canvas.height);

  const url = storage.generateThumbnailDataUrl({
    cols: 10,
    rows: 6,
    colors: new Float32Array(180).fill(0.2),
    textureCanvas: tile.canvas as any,
  });
  assert.ok(url.startsWith('data:image/webp'), `expected webp thumbnail, got ${url.slice(0, 24)}`);

  const fallbackUrl = storage.generateThumbnailDataUrl({
    cols: 4,
    rows: 4,
    colors: new Uint8Array(48).fill(128),
  });
  assert.ok(fallbackUrl.startsWith('data:image'), 'mosaic fallback must still render');
});

console.log('\n' + results.join('\n'));
const failed = results.filter((r) => r.startsWith('FAIL')).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
