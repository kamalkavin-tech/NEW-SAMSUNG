const IMAGE_CACHE_NAME = 'bbnl-image-cache-v1';

self.addEventListener('install', function (event) {
    self.skipWaiting();
});

self.addEventListener('activate', function (event) {
    event.waitUntil(self.clients.claim());
});

function isImageRequest(request) {
    if (!request || !request.url) return false;
    if (request.destination === 'image') return true;
    return /\.(png|jpg|jpeg|gif|webp|svg)(\?|#|$)/i.test(request.url);
}

self.addEventListener('fetch', function (event) {
    const req = event.request;

    if (!isImageRequest(req)) return;
    if (req.method !== 'GET') return;

    event.respondWith(
        caches.open(IMAGE_CACHE_NAME).then(function (cache) {
            return cache.match(req).then(function (cached) {
                if (cached) return cached;

                return fetch(req).then(function (networkResponse) {
                    if (networkResponse && networkResponse.ok) {
                        cache.put(req, networkResponse.clone());
                    }
                    return networkResponse;
                }).catch(function () {
                    return cached || Response.error();
                });
            });
        })
    );
});
