/**
 * UNRAVEL INDEXEDDB STORAGE UTILITY
 * 
 * Manages client-side persistence for:
 * 1. Auto-save / Resume of the active creation grid
 * 2. Capped local gallery (up to 8 recent creations with low-res thumbnails)
 */

import { SampledGridResult } from '@/lib/demoGenerator';

export interface SavedGridData {
  cols: number;
  rows: number;
  colors: Float32Array | number[];
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

/**
 * Converts a SavedGridData object (which may have number[] from JSON/IndexedDB)
 * into a typed SampledGridResult containing Float32Array.
 */
export function toSampledGridResult(grid: SavedGridData): SampledGridResult {
  return {
    cols: grid.cols,
    rows: grid.rows,
    colors: grid.colors instanceof Float32Array ? grid.colors : new Float32Array(grid.colors),
  };
}

/**
 * Persists the latest undisturbed creation grid to IndexedDB for auto-resume.
 */
export async function saveLastCreation(creation: SavedCreation): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_LAST, 'readwrite');
    const store = tx.objectStore(STORE_LAST);
    store.put(creation, 'active');
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
    const store = tx.objectStore(STORE_GALLERY);
    store.add(item);
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
 * Generates a low-res thumbnail data URL from sampled grid data (Float32Array RGBs) for gallery cards.
 */
export function generateThumbnailDataUrl(gridData: SavedGridData): string {
  if (typeof document === 'undefined') return '';

  const { cols, rows, colors } = gridData;
  const canvas = document.createElement('canvas');
  canvas.width = Math.min(cols, 120);
  canvas.height = Math.min(rows, 80);

  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const cellWidth = canvas.width / cols;
  const cellHeight = canvas.height / rows;

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i3 = (r * cols + c) * 3;
      const red = colors[i3] !== undefined ? Math.round(colors[i3] * 255) : 0;
      const green = colors[i3 + 1] !== undefined ? Math.round(colors[i3 + 1] * 255) : 0;
      const blue = colors[i3 + 2] !== undefined ? Math.round(colors[i3 + 2] * 255) : 0;

      ctx.fillStyle = `rgb(${red},${green},${blue})`;
      ctx.fillRect(c * cellWidth, r * cellHeight, cellWidth, cellHeight);
    }
  }

  return canvas.toDataURL('image/png');
}
