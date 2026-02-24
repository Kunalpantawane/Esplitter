// sw.js - Service Worker for offline caching

const CACHE_NAME = 'esplitter-v1';
const APP_SHELL = [
    '/',
    '/index.html',
    '/css/style.css',
    '/js/app.js',
    '/js/db.js',
    '/js/auth.js',
    '/js/sync.js',
    '/js/ui.js',
    'https://unpkg.com/dexie@3/dist/dexie.js',
];

// Install: pre-cache app shell
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
    );
    self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
        )
    );
    self.clients.claim();
});

// Fetch: Network-first for API, Cache-first for assets
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // API requests: network only (don't cache)
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(fetch(event.request).catch(() =>
            new Response(JSON.stringify({ error: 'Offline' }), {
                status: 503, headers: { 'Content-Type': 'application/json' },
            })
        ));
        return;
    }

    // App shell: Cache-first with network fallback
    event.respondWith(
        caches.match(event.request).then((cached) => {
            return cached || fetch(event.request).then((res) => {
                const clone = res.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                return res;
            });
        })
    );
});
