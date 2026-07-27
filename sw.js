const CACHE = 'finapp-v3';

// Собственные файлы — кешируем при установке.
const ASSETS = [
  '/finances/',
  '/finances/index.html',
  '/finances/manifest.json'
];

// Внешние библиотеки грузятся лениво; кладём их в кеш при первом успешном запросе,
// чтобы графики и распознавание работали офлайн со второго раза.
const CDN_HOSTS = ['cdnjs.cloudflare.com', 'cdn.jsdelivr.net'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

function shouldCache(request, response) {
  if (request.method !== 'GET') return false;
  if (!response) return false;
  const url = new URL(request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  // Курс ЦБ кешировать не нужно — он должен быть свежим.
  if (url.hostname.includes('cbr-xml-daily')) return false;
  if (url.origin === self.location.origin) return response.ok;
  // Для CDN допускаем opaque-ответы (type: 'opaque', status 0).
  if (CDN_HOSTS.includes(url.hostname)) return response.ok || response.type === 'opaque';
  return false;
}

self.addEventListener('fetch', e => {
  const request = e.request;

  e.respondWith(
    fetch(request)
      .then(res => {
        if (shouldCache(request, res)) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(request, clone)).catch(() => {});
        }
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        // Навигация без кеша — отдаём оболочку приложения вместо ошибки браузера.
        if (request.mode === 'navigate') {
          const shell = await caches.match('/finances/index.html');
          if (shell) return shell;
        }
        return new Response('Офлайн', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      })
  );
});
