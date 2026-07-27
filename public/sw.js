const urlParams = new URL(self.location.href).searchParams;
const VERSION = urlParams.get('v') || 'v11-v1';
const CACHE_NAME = `unravel-pwa-${VERSION}`;
const MEDIA_CACHE_NAME = 'unravel-media-cache';
const API_CACHE_NAME = 'unravel-api-cache';
const ALLOWED_CACHES = [CACHE_NAME, MEDIA_CACHE_NAME, API_CACHE_NAME];

// App shell assets to pre-cache on install
const APP_SHELL_ASSETS = [
  '/',
  '/manifest.json',
  '/favicon.ico',
  '/offline',
  '/icons/apple-touch-icon.png',
  '/icons/favicon-16x16.png',
  '/icons/favicon-32x32.png',
  '/icons/favicon-48x48.png',
  '/icons/favicon.ico',
  '/icons/icon-72.png',
  '/icons/icon-96.png',
  '/icons/icon-128.png',
  '/icons/icon-144.png',
  '/icons/icon-152.png',
  '/icons/icon-192.png',
  '/icons/icon-384.png',
  '/icons/icon-512.png',
  '/icons/icon-192-maskable.png',
  '/icons/icon-512-maskable.png'
];

// Metadata tracking using IndexedDB for LRU cache eviction
const DB_NAME = 'unravel-sw-metadata';
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('metadata')) {
        db.createObjectStore('metadata', { keyPath: 'url' });
      }
    };
    request.onsuccess = (event) => {
      resolve(event.target.result);
    };
    request.onerror = () => {
      resolve(null);
    };
  });
}

async function recordAccess(url, size, cacheName) {
  const db = await openDB();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const transaction = db.transaction(['metadata'], 'readwrite');
      const store = transaction.objectStore('metadata');
      store.put({
        url,
        size: size || 0,
        cacheName,
        lastAccessed: Date.now()
      });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
    } catch (e) {
      resolve();
    }
  });
}

async function removeMetadata(url) {
  const db = await openDB();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const transaction = db.transaction(['metadata'], 'readwrite');
      const store = transaction.objectStore('metadata');
      store.delete(url);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
    } catch (e) {
      resolve();
    }
  });
}

async function enforceCacheLimits(cacheName, maxSizeBytes, maxAgeMs) {
  const db = await openDB();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const transaction = db.transaction(['metadata'], 'readwrite');
      const store = transaction.objectStore('metadata');
      const entries = [];
      
      store.openCursor().onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          if (cursor.value.cacheName === cacheName) {
            entries.push(cursor.value);
          }
          cursor.continue();
        } else {
          performEviction();
        }
      };

      async function performEviction() {
        const now = Date.now();
        const toEvict = [];
        const remaining = [];

        // 1. Identify expired items
        for (const entry of entries) {
          if (now - entry.lastAccessed > maxAgeMs) {
            toEvict.push(entry.url);
          } else {
            remaining.push(entry);
          }
        }

        // 2. Sort remaining by lastAccessed ascending (oldest first)
        remaining.sort((a, b) => a.lastAccessed - b.lastAccessed);

        // 3. Check size cap
        let totalSize = remaining.reduce((sum, entry) => sum + entry.size, 0);
        while (totalSize > maxSizeBytes && remaining.length > 0) {
          const oldest = remaining.shift();
          toEvict.push(oldest.url);
          totalSize -= oldest.size;
        }

        // 4. Delete evicted items
        if (toEvict.length > 0) {
          const cache = await caches.open(cacheName);
          const deleteTx = db.transaction(['metadata'], 'readwrite');
          const deleteStore = deleteTx.objectStore('metadata');
          
          for (const url of toEvict) {
            cache.delete(url);
            deleteStore.delete(url);
          }
        }
        resolve();
      }
    } catch (e) {
      resolve();
    }
  });
}

function broadcast(data) {
  self.clients.matchAll({ type: 'window' }).then((clients) => {
    for (const client of clients) {
      client.postMessage(data);
    }
  });
}

// Install: pre-cache static app shell and icon assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate: clean up old cache versions, keeping media and api caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => !ALLOWED_CACHES.includes(key)).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch routing:
// - App Shell & Icons: Cache-First
// - Navigation requests (pages): Network-First, falling back to cached response or /offline
// - Non-user static assets: Cache-First
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // A. Cloudinary Media Caching -> Cache-First with Background Revalidation (stale-while-revalidate)
  if (url.hostname === 'res.cloudinary.com' && url.pathname.includes('/image/upload/')) {
    event.respondWith(
      caches.open(MEDIA_CACHE_NAME).then((cache) => {
        return cache.match(request).then((cachedResponse) => {
          const fetchPromise = fetch(request).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const responseToCache = networkResponse.clone();
              const contentLength = networkResponse.headers.get('content-length');
              const size = contentLength ? parseInt(contentLength, 10) : 0;
              cache.put(request, responseToCache);
              recordAccess(request.url, size, MEDIA_CACHE_NAME).then(() => {
                // Limit to 25 MB, max-age 14 days (14 * 24 * 60 * 60 * 1000)
                enforceCacheLimits(MEDIA_CACHE_NAME, 25 * 1024 * 1024, 14 * 24 * 60 * 60 * 1000);
              });
            }
            return networkResponse;
          });

          if (cachedResponse) {
            const contentLength = cachedResponse.headers.get('content-length');
            const size = contentLength ? parseInt(contentLength, 10) : 0;
            event.waitUntil(
              Promise.all([
                recordAccess(request.url, size, MEDIA_CACHE_NAME),
                fetchPromise.catch(() => {})
              ])
            );
            return cachedResponse;
          }

          return fetchPromise;
        });
      })
    );
    return;
  }

  // B. API GET Caching -> Stale-While-Revalidate
  const isApiRequest = url.pathname.startsWith('/api/gallery') ||
                       url.pathname.startsWith('/api/daily-challenge') ||
                       (url.pathname.startsWith('/api/creations/') && !url.pathname.endsWith('/report') && !url.pathname.endsWith('/remix'));

  if (isApiRequest) {
    event.respondWith(
      caches.open(API_CACHE_NAME).then((cache) => {
        return cache.match(request).then((cachedResponse) => {
          const fetchPromise = fetch(request).then(async (networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const responseToCache = networkResponse.clone();
              const contentLength = networkResponse.headers.get('content-length');
              const size = contentLength ? parseInt(contentLength, 10) : 0;
              
              await cache.put(request, responseToCache);
              await recordAccess(request.url, size, API_CACHE_NAME);
              // Limit to 2 MB, max-age 5 minutes (5 * 60 * 1000)
              await enforceCacheLimits(API_CACHE_NAME, 2 * 1024 * 1024, 5 * 60 * 1000);

              try {
                const freshData = await networkResponse.clone().json();
                broadcast({
                  type: 'API_CACHE_UPDATED',
                  url: request.url,
                  data: freshData
                });
              } catch (e) {}
            } else if (networkResponse && networkResponse.status === 404) {
              await cache.delete(request);
              await removeMetadata(request.url);
              broadcast({
                type: 'API_CACHE_UPDATED',
                url: request.url,
                data: { is_hidden: true, error: 'This content is no longer available.' }
              });
            }
            return networkResponse;
          });

          if (cachedResponse) {
            const contentLength = cachedResponse.headers.get('content-length');
            const size = contentLength ? parseInt(contentLength, 10) : 0;
            event.waitUntil(
              Promise.all([
                recordAccess(request.url, size, API_CACHE_NAME),
                fetchPromise.catch(() => {})
              ])
            );
            return cachedResponse;
          }

          return fetchPromise.catch(() => {
            return new Response(JSON.stringify({ error: 'You are offline.', offline: true }), {
              status: 503,
              headers: { 'Content-Type': 'application/json' }
            });
          });
        });
      })
    );
    return;
  }

  // 1. App Shell static assets & icons -> Cache-First
  if (url.pathname.startsWith('/icons/') || url.pathname === '/manifest.json' || url.pathname === '/favicon.ico') {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        return fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseToCache));
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // 2. HTML Navigation requests -> Network-First with Cache / Offline fallback
  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseToCache));
          }
          return networkResponse;
        })
        .catch(async () => {
          const cachedResponse = await caches.match(request);
          if (cachedResponse) return cachedResponse;
          const rootCached = await caches.match('/');
          if (rootCached) return rootCached;
          const offlinePage = await caches.match('/offline');
          return offlinePage || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/html' } });
        })
    );
    return;
  }

  // 3. All other GET requests -> Cache-First with Network fallback
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;
      return fetch(request)
        .then((networkResponse) => {
          const isGoogleFont = url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com');
          if (networkResponse && networkResponse.status === 200 && (networkResponse.type === 'basic' || isGoogleFont)) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseToCache));
          }
          return networkResponse;
        })
        .catch(() => {
          return new Response('Resource unavailable offline', { status: 503 });
        });
    })
  );
});
