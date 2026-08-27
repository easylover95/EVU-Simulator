/*
 * Dependency-free PWA runtime for the static Vite build.
 *
 * - App shell: network-first navigation with an offline shell fallback.
 * - Local images: bounded stale-while-revalidate cache.
 * - External tiles: deliberately never intercepted; the offline operation map is
 *   an application-owned SVG and therefore safe to precache.
 * - Runtime events: a small anonymous IndexedDB ring buffer for diagnostics.
 */
const CACHE_VERSION = 'evu-simulator-v6';
const APP_SHELL_CACHE = `${CACHE_VERSION}-shell`;
const IMAGE_RUNTIME_CACHE = `${CACHE_VERSION}-images`;
const MAX_RUNTIME_IMAGES = 50;

const RUNTIME_DB = 'evu-pwa-runtime';
const RUNTIME_EVENT_STORE = 'events';
const MAX_RUNTIME_EVENTS = 40;
const ALLOWED_RUNTIME_EVENTS = new Set([
  'installed',
  'activated',
  'offline',
  'online',
  'probe-failed',
  'cache-cleanup',
]);

const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/evu-192.png',
  '/icons/evu-256.png',
  '/icons/evu-512.png',
  '/icons/evu-512-maskable.png',
  '/maps/evu-betriebskarte-de.svg',
];

const isCacheable = (response) => response && response.status === 200 && response.type === 'basic';

const isLocalImage = (request, url) =>
  request.destination === 'image' || /\.(?:avif|webp|png|jpe?g|gif|svg)$/i.test(url.pathname);

function openRuntimeDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(RUNTIME_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(RUNTIME_EVENT_STORE)) {
        db.createObjectStore(RUNTIME_EVENT_STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestValue(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
    transaction.onerror = () => reject(transaction.error);
  });
}

/** Stores only event type and timestamp. No user, game or location data enters this buffer. */
async function recordRuntimeEvent(type) {
  if (!ALLOWED_RUNTIME_EVENTS.has(type)) return;
  try {
    const db = await openRuntimeDb();
    const transaction = db.transaction(RUNTIME_EVENT_STORE, 'readwrite');
    const store = transaction.objectStore(RUNTIME_EVENT_STORE);
    store.add({ type, at: Date.now() });
    const keys = await requestValue(store.getAllKeys());
    const excess = Math.max(0, keys.length - MAX_RUNTIME_EVENTS);
    keys.slice(0, excess).forEach((key) => store.delete(key));
    await transactionDone(transaction);
    db.close();
  } catch {
    // Diagnostics must never interfere with PWA startup or offline use.
  }
}

async function trimImageCache() {
  const cache = await caches.open(IMAGE_RUNTIME_CACHE);
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_RUNTIME_IMAGES)).map((key) => cache.delete(key)));
}

async function cacheRuntimeImage(request, response) {
  if (!isCacheable(response)) return;
  const cache = await caches.open(IMAGE_RUNTIME_CACHE);
  await cache.put(request, response.clone());
  await trimImageCache();
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(APP_SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => recordRuntimeEvent('installed'))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then(async (keys) => {
        const staleCaches = keys.filter(
          (key) =>
            key.startsWith('evu-simulator-') &&
            key !== APP_SHELL_CACHE &&
            key !== IMAGE_RUNTIME_CACHE,
        );
        await Promise.all(staleCaches.map((key) => caches.delete(key)));
        if (staleCaches.length > 0) await recordRuntimeEvent('cache-cleanup');
        await recordRuntimeEvent('activated');
        await self.clients.claim();
      }),
  );
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'evu-runtime-event') return;
  event.waitUntil(recordRuntimeEvent(data.event));
});

/**
 * Navigation remains network-first for fresh deployment HTML with an offline
 * shell fallback. Local images return a cached response immediately when
 * available and refresh in the background. Other build files remain cache-first
 * after their first successful use. External map tiles are not intercepted.
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  // This request is intentionally never served from the app-shell cache. It lets
  // the React UI distinguish a real reachable origin from navigator.onLine only.
  if (request.headers.get('X-EVU-Network-Probe') === '1') {
    event.respondWith(fetch(request).catch(() => new Response('', { status: 503, statusText: 'Offline' })));
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (isCacheable(response)) {
            const update = caches.open(APP_SHELL_CACHE).then((cache) => cache.put('/index.html', response.clone()));
            event.waitUntil(update);
          }
          return response;
        })
        .catch(() => caches.match('/index.html')),
    );
    return;
  }

  if (isLocalImage(request, url)) {
    event.respondWith(
      caches.open(IMAGE_RUNTIME_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const network = fetch(request)
          .then(async (response) => {
            await cacheRuntimeImage(request, response);
            return response;
          })
          .catch(() => undefined);

        if (cached) {
          event.waitUntil(network);
          return cached;
        }

        const response = await network;
        if (response) return response;
        return new Response('', { status: 504, statusText: 'Offline image unavailable' });
      }),
    );
    return;
  }

  event.respondWith(
    caches.open(APP_SHELL_CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) return cached;

      const response = await fetch(request);
      if (isCacheable(response)) {
        event.waitUntil(cache.put(request, response.clone()));
      }
      return response;
    }),
  );
});
