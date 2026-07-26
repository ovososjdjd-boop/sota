/**
 * Service worker: полноценная офлайн-работа.
 *
 * Требование директора — приложение работает без интернета.
 * Стратегия:
 *   - навигация: сеть с откатом в кэш (свежая версия, если сеть есть)
 *   - статика и WASM: кэш с фоновым обновлением (мгновенный отклик)
 * Всё вычисление и так локальное, сеть нужна только для загрузки файлов.
 */

const CACHE = 'ration-v1';

// Критичные ресурсы: без них приложение не запустится офлайн
const PRECACHE = ['./', './index.html', './manifest.webmanifest', './highs.wasm'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Навигация: сначала сеть, иначе кэш — чтобы обновления доезжали,
  // но офлайн приложение всё равно открывалось.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy));
          return response;
        })
        .catch(() =>
          caches.match('./index.html').then((r) => r ?? caches.match('./')),
        ),
    );
    return;
  }

  // Остальное: кэш сразу, обновление в фоне
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached ?? network;
    }),
  );
});
