/* jm-view-server 基础 Service Worker
   目的：满足 PWA 可安装的最小要求，并把 manifest / 图标等少量静态资源
   预缓存起来，加快“添加到主屏”后的启动。
   刻意不缓存页面 HTML / 接口，避免开发期看到旧内容。 */

const CACHE = 'jmv-static-v1';
const PRECACHE = [
  '/manifest.webmanifest',
  '/static/icons/icon-192.png',
  '/static/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const isPrecached = PRECACHE.includes(url.pathname);

  if (isPrecached) {
    // 静态资源：cache-first
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req))
    );
    return;
  }

  // 其余请求：直接透传网络，不做强缓存
  // （显式 respondWith 保持行为一致；失败时回退默认网络错误）
  event.respondWith(fetch(req));
});
