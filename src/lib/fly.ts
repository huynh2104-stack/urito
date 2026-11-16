/* 「カートへ飛ぶ」視覚フィードバック: Web Animations API のみでタップしたタイルの縮小コピーを
 * カート側へ放物線移動させ、prefers-reduced-motion 環境では無効化する。 */

const reduced = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** 移動先の座標基準を取得する（モバイルでは下部カートボタン、PC では対象明細行）。 */
function landingRect(productId: string): DOMRect | null {
  const fab = document.querySelector<HTMLElement>('.pos-cart-fab');
  if (fab && getComputedStyle(fab).display !== 'none') return fab.getBoundingClientRect();
  const line = document.querySelector<HTMLElement>(`.pos-right .cart-line-wrap[data-product="${productId}"]`);
  if (line) {
    const thumb = line.querySelector<HTMLElement>('.pthumb') ?? line;
    return thumb.getBoundingClientRect();
  }
  const list = document.querySelector<HTMLElement>('.pos-right .cart-lines');
  return list ? list.getBoundingClientRect() : null;
}

function pulse(el: Element | null, cls: string) {
  if (!el) return;
  el.classList.remove(cls);
  void (el as HTMLElement).offsetWidth;
  el.classList.add(cls);
  window.setTimeout(() => el.classList.remove(cls), 600);
}

export function flyToCart(source: HTMLElement | null, productId: string) {
  if (!source || reduced()) return;
  const from = source.getBoundingClientRect();
  if (!from.width) return;

  // React が追加明細を描画した直後のフレームで移動先要素を取得する
  window.setTimeout(() => {
    const target = landingRect(productId);
    if (!target) return;

    const size = 44;
    const sx = from.left + from.width / 2 - size / 2;
    const sy = from.top + from.height / 2 - size / 2;
    const isFab = !!document.querySelector('.pos-cart-fab') &&
      getComputedStyle(document.querySelector('.pos-cart-fab')!).display !== 'none';
    const ex = (isFab ? target.left + 36 : target.left + target.width / 2) - size / 2;
    const ey = target.top + target.height / 2 - size / 2;

    const badge = document.createElement('div');
    const mark = source.querySelector('.prod-mono, .prod-thumb, .pthumb');
    badge.className = 'fly-badge';
    badge.style.width = badge.style.height = `${size}px`;
    if (mark) {
      const cs = getComputedStyle(mark);
      badge.style.background = cs.color;
      badge.style.color = '#fff';
      badge.textContent = (mark.textContent || '').trim().slice(0, 2);
      const img = mark.querySelector('img');
      if (img) {
        badge.textContent = '';
        badge.style.backgroundImage = `url("${img.src}")`;
        badge.style.backgroundSize = 'cover';
        badge.style.backgroundPosition = 'center';
      }
    }
    document.body.appendChild(badge);

    // Quadratic Bezier with the control point lifted above the straight line.
    const cx = (sx + ex) / 2;
    const cy = Math.min(sy, ey) - 90;
    const steps = 14;
    const frames: Keyframe[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = (1 - t) * (1 - t) * sx + 2 * (1 - t) * t * cx + t * t * ex;
      const y = (1 - t) * (1 - t) * sy + 2 * (1 - t) * t * cy + t * t * ey;
      const scale = 1 - 0.62 * t;
      frames.push({
        transform: `translate(${x}px, ${y}px) scale(${scale})`,
        opacity: t > 0.85 ? 1 - (t - 0.85) / 0.15 * 0.6 : 1,
        offset: t,
      });
    }
    const anim = badge.animate(frames, { duration: 560, easing: 'cubic-bezier(.4,.05,.55,.95)', fill: 'forwards' });
    anim.onfinish = () => {
      badge.remove();
      pulse(document.querySelector('.pos-cart-fab .fab-count'), 'bump');
      pulse(document.querySelector('.pos-right .grand-amount'), 'bump');
      pulse(document.querySelector(`.pos-right .cart-line-wrap[data-product="${productId}"] .cart-line`), 'flash');
    };
    anim.oncancel = () => badge.remove();
    // Safety net: never leave a stray badge if the tab was throttled mid-flight.
    window.setTimeout(() => badge.remove(), 1200);
  }, 24);
}
