/*
 * Dependency-free PWA cache for the static Vite build.
 * App shell assets are cache-first. Local image assets use a separate,
 * bounded stale-while-revalidate cache to stay fast without growing forever.
 */
const CACHE_VERSION = 'evu-simulator-v3';
const APP_SHELL_CACHE = `${CACHE_VERSION}-shell`;
const IMAGE_RUNTIME_CACHE = `${CACHE_VERSION}-images`;
const MAX_RUNTIME_IMAGES = 50;

const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/evu-256.png',
  '/icons/evu-512.png',
];

const isCacheable = (response) => response && response.status === 200 && response.type === 'basic';

const isLocalImage = (request, url) =>
  request.destination === 'image' || /\.(?:avif|webp|png|jpe?g|gif|svg)$/i.test(url.pathname);

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
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== APP_SHELL_CACHE && key !== IMAGE_RUNTIME_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/**
 * Navigation remains network-first for fresh deployment HTML with an offline
 * shell fallback. Local images return a cached response immediately when
 * available and refresh in the background. Other build files remain cache-first
 * on first successful use. External map tiles are deliberately not intercepted.
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

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
