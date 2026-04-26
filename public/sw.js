// Stargate Ship — Service Worker
// Cache name includes date for easy busting
const CACHE = 'sgs-v2-2026-04-26';
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/og-image.png',
  '/404.html',
  '/offline.html',
];

// Install — precache the app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

// Activate — claim clients and delete old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Listen for skip-waiting message from the page
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Fetch — stale-while-revalidate for HTML, cache-first for assets, network-first for everything else
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // Sprites and assets — cache-first (immutable, content-hashed)
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/sprites/')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Icons, manifest, favicon — cache-first
  if (
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.png') ||
    url.pathname === '/manifest.json' ||
    url.pathname === '/favicon.ico'
  ) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // HTML pages — network-first with offline fallback
  if (url.pathname.endsWith('.html') || url.pathname === '/') {
    event.respondWith(networkFirst(request));
    return;
  }

  // Everything else — network-first
  event.respondWith(networkFirst(request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  return cached || fetchAndCache(request);
}

async function networkFirst(request) {
  try {
    const response = await fetchAndCache(request);
    if (response) return response;
    throw new Error('No response');
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    // If it's a navigation request, show offline page
    if (request.mode === 'navigate') {
      const offlinePage = await caches.match('/offline.html');
      if (offlinePage) return offlinePage;
    }
    return caches.match('/404.html');
  }
}

async function fetchAndCache(request) {
  const response = await fetch(request);
  if (!response || response.status !== 200 || response.type !== 'basic') return response;
  const clone = response.clone();
  caches.open(CACHE).then((cache) => cache.put(request, clone));
  return response;
}
