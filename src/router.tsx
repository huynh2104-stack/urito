import { useEffect, useState } from 'react';

/** 静的ホスティングやサーバー設定不要で動作する軽量ハッシュルーター。 */

export type RoutePath = string;

function currentHash(): string {
  const raw = window.location.hash.replace(/^#/, '');
  return raw.startsWith('/') ? raw : `/${raw}`;
}

export function navigate(path: RoutePath, replace = false): void {
  const target = `#${path.startsWith('/') ? path : `/${path}`}`;
  if (replace) window.location.replace(target);
  else window.location.hash = target;
}

export interface Route {
  path: string;
  segments: string[];
  query: URLSearchParams;
}

function parse(hash: string): Route {
  const [pathPart, queryPart = ''] = hash.split('?');
  const path = pathPart === '/' || pathPart === '' ? '/' : pathPart.replace(/\/+$/, '');
  return {
    path,
    segments: path.split('/').filter(Boolean),
    query: new URLSearchParams(queryPart),
  };
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parse(currentHash()));

  useEffect(() => {
    const onChange = () => setRoute(parse(currentHash()));
    window.addEventListener('hashchange', onChange);
    if (!window.location.hash) navigate('/', true);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  return route;
}

/** 画面遷移時にコンテナの先頭へスクロール位置を戻す。 */
export function useScrollReset(key: string): void {
  useEffect(() => {
    document.querySelector('.page')?.scrollTo({ top: 0 });
  }, [key]);
}
