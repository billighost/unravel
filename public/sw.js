const urlParams = new URL(self.location.href).searchParams;
const VERSION = urlParams.get('v') || 'v12-v1';
const CACHE_NAME = `unravel-pwa-${VERSION}`;
const MEDIA_CACHE_NAME = 'unravel-media-cache';
const API_CACHE_NAME = 'unravel-api-cache';
const ALLOWED_CACHES = [CACHE_NAME, MEDIA_CACHE_NAME, API_CACHE_NAME];

/**
 * How long a navigation waits for the network before falling back to cache.
 *
 * Network-first with no deadline means a flaky or captive connection stalls the
 * app for the full request timeout even though a perfectly good cached copy is
 * sitting right there. The cached shell is served instead, and the network
 * response still lands in the cache for next time.
 */
const NAV_NETWORK_TIMEOUT_MS = 2500;

// App shell assets to pre-cache on install. Every route is listed so the whole
// app is navigable offline after the first visit, not just the page that
// happened to be open.
const APP_SHELL_ASSETS = [
  '/',
  '/gallery',
  '/about',
  '/privacy',
  '/terms',
  '/offline',
  '/manifest.json',
  '/favicon.ico',
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

// Install: pre-cache static app shell and icon assets.
//
// Each asset is fetched individually rather than with cache.addAll, which
// rejects the whole install if a single URL 404s — one missing icon used to be
// enough to leave the app with no precache at all.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(
        APP_SHELL_ASSETS.map((asset) =>
          fetch(asset, { cache: 'reload' }).then((response) => {
            if (response && response.status === 200) {
              return cache.put(asset, response);
            }
          })
        )
      )
    )
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

// Lets the page ask for extra URLs to be cached once it is idle — used to warm
// the JS chunks and route payloads of pages the user has not visited yet, so
// going offline mid-session never hits an uncached route.
self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'WARM_CACHE' || !Array.isArray(data.urls)) return;

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(
        data.urls.map(async (url) => {
          const existing = await cache.match(url);
          if (existing) return;
          const response = await fetch(url, { credentials: 'same-origin' });
          if (response && response.status === 200) {
            await cache.put(url, response);
          }
        })
      )
    )
  );
});

/**
 * Network-first with a deadline, then cache, then the offline shell.
 * Used for both HTML navigations and App Router RSC payloads.
 *
 * `cacheable` is false for RSC payloads that carry no distinguishing query
 * param: those would be stored under the same key as the route's HTML document,
 * and serving a component payload in answer to a navigation renders a broken
 * page. Next falls back to a full page load when an RSC fetch fails, so those
 * requests lose nothing by going uncached.
 */
async function navigationStrategy(event, request, cacheable = true) {
  const cache = await caches.open(CACHE_NAME);

  const networkPromise = fetch(request)
    .then((response) => {
      if (cacheable && response && response.status === 200) {
        cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    })
    .catch(() => null);

  // Keep the worker alive for the background cache write even if we answer
  // from cache below.
  event.waitUntil(networkPromise);

  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), NAV_NETWORK_TIMEOUT_MS));
  const fastResponse = await Promise.race([networkPromise, timeout]);
  if (fastResponse) return fastResponse;

  // ignoreVary: Next varies HTML responses on its router headers, which differ
  // between a precache fetch and a real navigation. Without this the precached
  // shell would never match and offline navigation would fail.
  const cached = await cache.match(request, { ignoreVary: true });
  if (cached) return cached;

  // Nothing cached for this URL, so the network is the only hope — wait it out.
  const lateResponse = await networkPromise;
  if (lateResponse) return lateResponse;

  const rootCached = await cache.match('/', { ignoreVary: true });
  if (rootCached) return rootCached;
  const offlinePage = await cache.match('/offline', { ignoreVary: true });
  return (
    offlinePage ||
    new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/html' } })
  );
}

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

  // 1b. Hashed build output is immutable -> Cache-First, and never revalidated.
  // These are the bulk of the bytes on a cold load, so serving them straight
  // from cache is what makes a repeat visit paint almost immediately.
  if (url.pathname.startsWith('/_next/static/')) {
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

  // 2. HTML navigations and App Router RSC payloads -> Network-First with a
  // timeout, then cache, then the offline shell.
  //
  // RSC payloads (client-side route transitions) used to fall through to the
  // catch-all cache-first rule below, which pinned them to whatever was cached
  // on the first visit — a client-side navigation could show indefinitely stale
  // content while a full page load showed fresh content.
  const accept = request.headers.get('accept') || '';
  const isRscRequest = url.searchParams.has('_rsc') || accept.includes('text/x-component');

  if (request.mode === 'navigate' || accept.includes('text/html') || isRscRequest) {
    const cacheable = !isRscRequest || url.searchParams.has('_rsc');
    event.respondWith(navigationStrategy(event, request, cacheable));
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
