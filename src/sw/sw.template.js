/* Urito Service Worker（ビルド時にキャッシュ名とプリキャッシュ一覧を注入する）
 * インストールの失敗は隠蔽せず拒否し、プリキャッシュ済みアセットはキャッシュ優先でオフライン動作を保証する。 */

const CACHE = '__URITO_CACHE__';
const PRECACHE = /*__URITO_PRECACHE__*/ [];

self.addEventListener('install', (event) => {
  /* skipWaiting() はメッセージ受信時のみ呼び出し、利用中の画面・会計処理を強制リロードしない */
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
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
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      caches.match(request, { ignoreSearch: true }).then((hit) => {
        if (hit) return hit;
        return caches.match('./index.html', { ignoreSearch: true }).then((shell) => {
          if (shell) return shell;
          return fetch(request).then((response) => {
            if (response.ok && response.type === 'basic') {
              const copy = response.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          });
        });
      }),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit;
      return fetch(request).then((response) => {
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});
