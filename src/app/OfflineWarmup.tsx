'use client';

import { useEffect } from 'react';

/**
 * Warms the service worker cache for routes the user has not opened yet.
 *
 * The service worker caches whatever it sees, so after a first visit the current
 * page works offline — but a route the user never opened has no cached document
 * and would fail the moment the connection drops. Once the app is idle we hand
 * the worker a list of routes to fetch in the background, which is cheap (they
 * are small, statically rendered documents) and makes the whole app navigable
 * offline rather than just the entry page.
 */
const ROUTES_TO_WARM = ['/', '/gallery', '/about', '/privacy', '/terms', '/offline'];

export default function OfflineWarmup() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    let cancelled = false;
    let idleHandle: number | undefined;

    const warm = async () => {
      try {
        const registration = await navigator.serviceWorker.ready;
        if (cancelled || !registration.active) return;
        registration.active.postMessage({ type: 'WARM_CACHE', urls: ROUTES_TO_WARM });
      } catch (_) {
        // A browser without service worker support just loses the warm-up.
      }
    };

    const schedule = () => {
      const idle = (window as unknown as {
        requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      }).requestIdleCallback;

      if (idle) {
        idleHandle = idle(warm, { timeout: 8000 });
      } else {
        idleHandle = window.setTimeout(warm, 4000);
      }
    };

    // Wait for load so the warm-up never competes with the first paint.
    if (document.readyState === 'complete') {
      schedule();
    } else {
      window.addEventListener('load', schedule, { once: true });
    }

    return () => {
      cancelled = true;
      window.removeEventListener('load', schedule);
      if (idleHandle !== undefined) {
        const cancelIdle = (window as unknown as {
          cancelIdleCallback?: (handle: number) => void;
        }).cancelIdleCallback;
        if (cancelIdle) cancelIdle(idleHandle);
        else window.clearTimeout(idleHandle);
      }
    };
  }, []);

  return null;
}
