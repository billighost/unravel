/**
 * UNRAVEL INDEXEDDB STORAGE UTILITY
 * 
 * Manages client-side persistence for:
 * 1. Auto-save / Resume of the active creation grid
 * 2. Capped local gallery (up to 8 recent creations with low-res thumbnails)
 */

import { SampledGridResult, ContrastMode } from '@/lib/demoGenerator';

/**
 * Colour payload formats, newest first:
 *  - `Uint8Array`   — how creations are stored locally now: 3 bytes per cube,
 *                     structured-cloneable, no string parsing on restore.
 *  - `"b64:…"`      — how colours travel over the API (see encodeColorsForApi).
 *  - hex `string`   — legacy API/IndexedDB format, 2 chars per byte.
 *  - `number[]` / `Float32Array` — legacy raw floats.
 */
export type ColorPayload = Uint8Array | Float32Array | number[] | string;

export interface SavedGridData {
  cols: number;
  rows: number;
  colors: ColorPayload;
  /**
   * The artwork texture, encoded as an image Blob.
   *
   * Blobs are structured-cloneable, canvases are not: writing the live
   * `textureCanvas` straight to IndexedDB threw DataCloneError and aborted the
   * whole save, which is why creations silently stopped persisting.
   */
  texture?: Blob;
  /** Tone-shaping profile used for the averages, so the grid can be re-derived. */
  contrast?: ContrastMode;
}

export interface SavedCreation {
  gridData: SavedGridData;
  mode?: string;
  timestamp: number;
}

export interface GalleryItem {
  id?: number;
  gridData: SavedGridData;
  mode?: string;
  timestamp: number;
  thumbnail: string; // low-res data URL
}

const DB_NAME = 'UnravelStorageDB';
const DB_VERSION = 1;
const STORE_LAST = 'last_creation';
const STORE_GALLERY = 'gallery_items';

/** Marks a base64-encoded colour payload, to tell it apart from legacy hex. */
const BASE64_PREFIX = 'b64:';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_LAST)) {
        db.createObjectStore(STORE_LAST);
      }
      if (!db.objectStoreNames.contains(STORE_GALLERY)) {
        db.createObjectStore(STORE_GALLERY, { keyPath: 'id', autoIncrement: true });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Quantises normalized [0,1] float colours to one byte per channel. */
export function encodeColorBytes(colors: Float32Array | number[]): Uint8Array {
  const bytes = new Uint8Array(colors.length);
  for (let i = 0; i < colors.length; i++) {
    bytes[i] = Math.min(255, Math.max(0, Math.round(colors[i] * 255)));
  }
  return bytes;
}

/**
 * Encodes colours for API transport as base64 bytes.
 *
 * Base64 costs 4 characters per 3 bytes (33% overhead) where the previous hex
 * encoding cost 2 characters per byte (100%), so the same grid travels in half
 * the payload and decodes without per-byte parseInt calls.
 */
export function encodeColorsForApi(colors: Float32Array | number[] | Uint8Array): string {
  const bytes = colors instanceof Uint8Array ? colors : encodeColorBytes(colors);

  let binary = '';
  // Chunked so a large grid never blows the argument limit of String.fromCharCode.
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
  }

  if (typeof btoa === 'function') return BASE64_PREFIX + btoa(binary);
  return BASE64_PREFIX + Buffer.from(bytes).toString('base64');
}

/** Back-compat alias — this is still the encoder used by the API callers. */
export const compressColors = encodeColorsForApi;

/** Decodes any supported colour payload into normalized [0,1] floats. */
export function decodeColors(payload: ColorPayload): Float32Array {
  if (payload instanceof Float32Array) return payload;

  if (payload instanceof Uint8Array) {
    const out = new Float32Array(payload.length);
    for (let i = 0; i < payload.length; i++) out[i] = payload[i] / 255;
    return out;
  }

  if (Array.isArray(payload)) return new Float32Array(payload);

  if (typeof payload === 'string') {
    if (payload.startsWith(BASE64_PREFIX)) {
      const base64 = payload.slice(BASE64_PREFIX.length);
      const binary = typeof atob === 'function'
        ? atob(base64)
        : Buffer.from(base64, 'base64').toString('binary');
      const out = new Float32Array(binary.length);
      for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i) / 255;
      return out;
    }

    // Legacy hex.
    const out = new Float32Array(payload.length / 2);
    for (let i = 0; i < out.length; i++) {
      out[i] = parseInt(payload.substring(i * 2, i * 2 + 2), 16) / 255;
    }
    return out;
  }

  return new Float32Array(0);
}

/** Back-compat alias for the decoder. */
export const decompressColors = decodeColors;


/**
 * Compresses disturbed positions objects into a flat array of rounded numbers.
 */
export function compressDisturbedPositions(disturbed: Array<{ i: number; x: number; y: number; z: number; rx: number; ry: number; rz: number }>): number[] {
  const result: number[] = [];
  for (let i = 0; i < disturbed.length; i++) {
    const item = disturbed[i];
    result.push(
      item.i,
      Math.round(item.x * 1000) / 1000,
      Math.round(item.y * 1000) / 1000,
      Math.round(item.z * 1000) / 1000,
      Math.round(item.rx * 1000) / 1000,
      Math.round(item.ry * 1000) / 1000,
      Math.round(item.rz * 1000) / 1000
    );
  }
  return result;
}

/**
 * Converts a SavedGridData object into a typed SampledGridResult.
 * Colours only — use restoreSavedGrid() to also decode the artwork texture.
 */
export function toSampledGridResult(grid: SavedGridData): SampledGridResult {
  return {
    cols: grid.cols,
    rows: grid.rows,
    colors: decodeColors(grid.colors),
    contrast: grid.contrast,
  };
}

/** Promise wrapper around canvas.toBlob, preferring WebP for size. */
function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), 'image/webp', 0.9);
    } catch (_) {
      resolve(null);
    }
  });
}

/** Decodes a stored texture Blob into something three.js can upload directly. */
async function blobToTextureSource(blob: Blob): Promise<ImageBitmap | HTMLImageElement | null> {
  try {
    if (typeof createImageBitmap === 'function') {
      return await createImageBitmap(blob);
    }
  } catch (_) {
    // Fall through to the <img> path below.
  }

  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Texture decode failed'));
      img.src = url;
    });
    // decode() has resolved by the time onload fires, so the bitmap is safe to
    // upload even though the object URL is revoked immediately after.
    return img;
  } catch (_) {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Rebuilds a full SampledGridResult from a saved record, including the
 * high-resolution artwork texture so a restored creation looks identical to the
 * moment it was made rather than falling back to flat per-cube averages.
 */
export async function restoreSavedGrid(grid: SavedGridData): Promise<SampledGridResult> {
  const result = toSampledGridResult(grid);

  if (grid.texture instanceof Blob) {
    const source = await blobToTextureSource(grid.texture);
    if (source) result.textureCanvas = source;
  }

  return result;
}

/**
 * Serialises a live grid for persistence: byte colours plus the artwork texture
 * as an image Blob. Strips the canvas, which cannot be structured-cloned.
 */
export async function toSavedGridData(gridData: SampledGridResult): Promise<SavedGridData> {
  const saved: SavedGridData = {
    cols: gridData.cols,
    rows: gridData.rows,
    colors: encodeColorBytes(gridData.colors),
    contrast: gridData.contrast,
  };

  const source = gridData.textureCanvas;
  if (source) {
    // A restored creation carries an ImageBitmap rather than a canvas, so draw
    // whatever we have into one first — otherwise re-saving after a resume
    // would quietly drop the artwork texture.
    const canvas = source instanceof HTMLCanvasElement ? source : drawToCanvas(source);
    if (canvas) {
      const blob = await canvasToBlob(canvas);
      if (blob) saved.texture = blob;
    }
  }

  return saved;
}

/** Copies a decoded image source into a canvas so it can be re-encoded. */
function drawToCanvas(source: ImageBitmap | HTMLImageElement): HTMLCanvasElement | null {
  const width = source.width;
  const height = source.height;
  if (!width || !height) return null;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.drawImage(source as CanvasImageSource, 0, 0);
  return canvas;
}

/**
 * Persists a creation as both the active auto-resume record and a local gallery
 * entry. The texture is encoded once and shared between the two writes.
 */
export async function persistCreation(gridData: SampledGridResult, mode: string): Promise<void> {
  const saved = await toSavedGridData(gridData);
  const timestamp = Date.now();
  const thumbnail = generateThumbnailDataUrl(gridData);

  await Promise.all([
    saveLastCreation({ gridData: saved, mode, timestamp }),
    addGalleryItem({ gridData: saved, mode, timestamp, thumbnail }),
  ]);
}


/**
 * Persists the latest undisturbed creation grid to IndexedDB for auto-resume.
 */
export async function saveLastCreation(creation: SavedCreation): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_LAST, 'readwrite');
      tx.objectStore(STORE_LAST).put(creation, 'active');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('Failed to auto-save creation to IndexedDB:', err);
  }
}

/**
 * Retrieves the saved creation if present.
 */
export async function getLastCreation(): Promise<SavedCreation | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_LAST, 'readonly');
      const store = tx.objectStore(STORE_LAST);
      const req = store.get('active');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch (err) {
    return null;
  }
}

/**
 * Clears the active saved creation (e.g., when user starts a fresh creation).
 */
export async function clearLastCreation(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_LAST, 'readwrite');
    const store = tx.objectStore(STORE_LAST);
    store.delete('active');
  } catch (err) {
    console.warn('Failed to clear last creation:', err);
  }
}

/**
 * Adds a new creation to the local gallery, capping total stored items at 8.
 */
export async function addGalleryItem(item: Omit<GalleryItem, 'id'>): Promise<void> {
  try {
    const db = await openDB();
    const items = await getGalleryItems();

    // Cap at 8 items: delete oldest if capacity reached
    if (items.length >= 8) {
      const oldest = items[0];
      if (oldest.id !== undefined) {
        await deleteGalleryItem(oldest.id);
      }
    }

    const tx = db.transaction(STORE_GALLERY, 'readwrite');
    tx.objectStore(STORE_GALLERY).add(item);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('Failed to add gallery item to IndexedDB:', err);
  }
}

/**
 * Retrieves all saved gallery items ordered by ID (chronological).
 */
export async function getGalleryItems(): Promise<GalleryItem[]> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_GALLERY, 'readonly');
      const store = tx.objectStore(STORE_GALLERY);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  } catch (err) {
    return [];
  }
}

/**
 * Deletes a single item from the local gallery by ID.
 */
export async function deleteGalleryItem(id: number): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_GALLERY, 'readwrite');
    const store = tx.objectStore(STORE_GALLERY);
    store.delete(id);
  } catch (err) {
    console.warn('Failed to delete gallery item:', err);
  }
}

/**
 * Renders a small preview data URL for gallery cards and share thumbnails.
 *
 * When the grid carries an artwork texture the thumbnail is drawn from that, so
 * cards show the real picture instead of a cols x rows mosaic of averages. The
 * per-cube averages remain the fallback for procedural and legacy grids.
 */
export function generateThumbnailDataUrl(
  gridData: SavedGridData | SampledGridResult
): string {
  if (typeof document === 'undefined') return '';

  const { cols, rows } = gridData;
  if (cols <= 0 || rows <= 0) return '';

  try {
    const textureSource = (gridData as SampledGridResult).textureCanvas;

    // Long edge capped at 512px: crisp enough to double as a share image,
    // small enough to stay a cheap upload.
    const scale = 512 / Math.max(cols, rows);
    const targetW = Math.max(1, Math.round(cols * scale));
    const targetH = Math.max(1, Math.round(rows * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    if (textureSource) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(textureSource as CanvasImageSource, 0, 0, targetW, targetH);
      return canvas.toDataURL('image/webp', 0.85);
    }

    // Fallback: paint one pixel per cube, then scale up without smoothing so
    // the mosaic keeps its hard pixel edges.
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = cols;
    tempCanvas.height = rows;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return '';

    const imgData = tempCtx.createImageData(cols, rows);
    const data = imgData.data;
    const colorArray = decodeColors((gridData as SavedGridData).colors);

    for (let i = 0; i < cols * rows; i++) {
      const i3 = i * 3;
      const i4 = i * 4;
      data[i4] = colorArray[i3] !== undefined ? Math.round(colorArray[i3] * 255) : 0;
      data[i4 + 1] = colorArray[i3 + 1] !== undefined ? Math.round(colorArray[i3 + 1] * 255) : 0;
      data[i4 + 2] = colorArray[i3 + 2] !== undefined ? Math.round(colorArray[i3 + 2] * 255) : 0;
      data[i4 + 3] = 255;
    }
    tempCtx.putImageData(imgData, 0, 0);

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tempCanvas, 0, 0, targetW, targetH);

    return canvas.toDataURL('image/webp', 0.85);
  } catch (err) {
    console.error('Failed to generate thumbnail data URL:', err);
    return '';
  }
}
