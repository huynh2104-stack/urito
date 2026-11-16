import { db, kvGet, kvSet } from '@/db/db';
import { APP_VERSION } from '@/version';

const DIAG_KEY = 'diag.errors';
const MAX_ERRORS = 50;

export type ErrorKind = 'error' | 'rejection' | 'boundary';

export interface ErrorEntry {
  at: number;
  kind: ErrorKind;
  message: string;
  stack: string;
  route: string;
}

let writeQueue: Promise<void> = Promise.resolve();

function safeMessage(err: unknown, fallback = ''): string {
  if (err instanceof Error) return err.message || err.name;
  if (typeof err === 'string') return err;
  if (typeof err === 'number' || typeof err === 'boolean') return String(err);
  if (err == null) return fallback;
  try {
    return JSON.stringify(err);
  } catch {
    return fallback;
  }
}

/** 動的importのチャンク読み込み失敗（キャッシュ不整合等）かどうかを判定する。 */
export function isChunkLoadError(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.name} ${err.message}` : safeMessage(err);
  return /ChunkLoadError|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(
    msg,
  );
}

function formatError(err: unknown): { message: string; stack: string } {
  if (err instanceof Error) {
    return { message: err.message || err.name, stack: err.stack ?? '' };
  }
  return { message: safeMessage(err, 'Unknown error'), stack: '' };
}

/** エラーをリングバッファ（最大50件）として kv に追記する。 */
export function recordError(kind: ErrorKind, err: unknown, route?: string): Promise<void> {
  const { message, stack } = formatError(err);
  const currentRoute = route ?? (typeof window !== 'undefined' ? window.location.hash || '/' : '/');
  const entry: ErrorEntry = {
    at: Date.now(),
    kind,
    message: message.slice(0, 500),
    stack: stack.slice(0, 2000),
    route: currentRoute.slice(0, 200),
  };

  writeQueue = writeQueue
    .then(async () => {
      if (!db.isOpen()) return;
      const prev = (await kvGet<ErrorEntry[]>(DIAG_KEY)) ?? [];
      const next = [...prev, entry].slice(-MAX_ERRORS);
      await kvSet(DIAG_KEY, next);
    })
    .catch(() => {
      /* ログ記録の失敗でアプリ本体の動作を止めない */
    });
  return writeQueue;
}

export async function getErrorLog(): Promise<ErrorEntry[]> {
  try {
    if (!db.isOpen()) return [];
    return (await kvGet<ErrorEntry[]>(DIAG_KEY)) ?? [];
  } catch {
    return [];
  }
}

export async function downloadDiagnosticLog(): Promise<void> {
  const errors = await getErrorLog();
  const payload = {
    app: 'urito',
    appVersion: APP_VERSION,
    exportedAt: Date.now(),
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    errors,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `urito-diagnostics-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

let installed = false;

/** window の未捕捉エラーと未処理Promise拒否を診断ログへ記録する。 */
export function installGlobalErrorLogging(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('error', (event) => {
    void recordError('error', event.error ?? event.message);
  });
  window.addEventListener('unhandledrejection', (event) => {
    void recordError('rejection', event.reason);
  });
}
