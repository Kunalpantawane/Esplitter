// sw.js - Service Worker for offline caching

// Bump version when app shell changes to force cache refresh on all clients
const CACHE_NAME = 'esplitter-v2';

// Local-only resources that MUST be cached for the app to work offline.
// Do NOT include external CDN URLs here — a single network failure during install
// aborts the entire service worker installation.
const APP_SHELL = [
    '/',
    '/index.html',
    '/css/style.css',
    '/js/app.js',
    '/js/db.js',
    '/js/auth.js',
    '/js/sync.js',
    '/js/ui.js',
    '/js/qrpay.js',
];

// CDN resources we try to cache but won't fail install if unavailable
const CDN_SHELL = [
    'https://unpkg.com/dexie@3/dist/dexie.js',
    'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',
    'https://unpkg.com/qrcode@1.5.3/build/qrcode.min.js',
];

// Install: pre-cache app shell
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(async (cache) => {
            // Cache local resources first — these must succeed
            await cache.addAll(APP_SHELL);
            // Try to warm the CDN cache gracefully; failures are non-fatal
            for (const url of CDN_SHELL) {
                try {
                    await cache.add(url);
                } catch (e) {
                    console.warn('[SW] CDN pre-cache failed (non-fatal):', url);
                }
            }
        })
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
