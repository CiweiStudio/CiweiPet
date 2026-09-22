/* ============================================================
   Ciweipet Service Worker · v9
   缓存：图标 + 主页资源 + 刺猬资源
   策略：HTML → 网络优先（保证内容最新）
        静态资源 → 缓存优先（快）
================================================================ */
var CACHE_NAME = 'ciweipet-v9';
var STATIC_ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './icon-192.png',
    './icon-512.png',
    './idle-1.png',
    './idle-2.png',
    './blink.png',
    './surprised.png',
    './happy.png',
    './angry.png',
    './sleep.png',
    './ciweipet.css',
    './ciweipet.js',
    './ai.html',
    './ai-config.json'
];

self.addEventListener('install', function (e) {
    e.waitUntil(
        caches.open(CACHE_NAME)
            .then(function (cache) { return cache.addAll(STATIC_ASSETS); })
            .then(function () { return self.skipWaiting(); })
    );
});

self.addEventListener('activate', function (e) {
    e.waitUntil(
        caches.keys().then(function (keys) {
            return Promise.all(
                keys.filter(function (k) { return k !== CACHE_NAME; })
                    .map(function (k) { return caches.delete(k); })
            );
        }).then(function () { return self.clients.claim(); })
    );
});

self.addEventListener('fetch', function (e) {
    if (e.request.method !== 'GET') return;
    var url = new URL(e.request.url);

    // 外部请求（GitHub API、CDN、字体等）→ 不缓存，直接走网络
    if (url.origin !== location.origin) return;

    // HTML 页面 → Network First
    var accept = e.request.headers.get('accept') || '';
    var isHTML = accept.indexOf('text/html') !== -1;

    if (isHTML) {
        e.respondWith(
            fetch(e.request).then(function (res) {
                if (res && res.status === 200) {
                    var clone = res.clone();
                    caches.open(CACHE_NAME).then(function (c) {
                        c.put(e.request, clone);
                    });
                }
                return res;
            }).catch(function () {
                return caches.match(e.request);
            })
        );
        return;
    }

    // 静态资源 → Cache First
    e.respondWith(
        caches.match(e.request).then(function (cached) {
            var network = fetch(e.request).then(function (res) {
                if (res && res.status === 200) {
                    var clone = res.clone();
                    caches.open(CACHE_NAME).then(function (c) {
                        c.put(e.request, clone);
                    });
                }
                return res;
            }).catch(function () { return cached; });
            return cached || network;
        })
    );
});