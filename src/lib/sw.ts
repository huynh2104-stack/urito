import { useApp } from '@/store/app';

let waitingWorker: ServiceWorker | null = null;

function markWaiting(worker: ServiceWorker | null): void {
  if (!worker) return;
  waitingWorker = worker;
  useApp.getState().setUpdateReady(true);
}

/** B-07: Service Worker を即時登録し、待機中の新バージョンを検知する。 */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  navigator.serviceWorker
    .register(`${import.meta.env.BASE_URL}sw.js`)
    .then((reg) => {
      if (reg.waiting && navigator.serviceWorker.controller) {
        markWaiting(reg.waiting);
      }
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            markWaiting(worker);
          }
        });
      });
    })
    .catch(() => {
      /* オフライン支援は補助機能のため失敗しても動作を止めない */
    });
}

/** B-07: 待機中の Service Worker に SKIP_WAITING を通知し、有効化後に再読込する。 */
export function applyServiceWorkerUpdate(): boolean {
  if (!waitingWorker || !('serviceWorker' in navigator)) return false;
  let reloading = false;
  navigator.serviceWorker.addEventListener(
    'controllerchange',
    () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    },
    { once: true },
  );
  waitingWorker.postMessage({ type: 'SKIP_WAITING' });
  waitingWorker = null;
  return true;
}
