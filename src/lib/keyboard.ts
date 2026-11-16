/* モバイルブラウザではソフトウェアキーボード表示時に画面高さが自動縮小されないため、
 * Visual Viewport API でキーボード高を計測して CSS 変数 --kb に反映し、下部シートが隠れないよう持ち上げる。 */

const OPEN_THRESHOLD = 80; // px 単位: これ未満の差分はブラウザツールバーによる変動とみなす

export function installKeyboardTracking(): void {
  const vv = window.visualViewport;
  const root = document.documentElement;
  if (!vv) return;

  let frame = 0;
  const update = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const covered = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      const keyboard = covered > OPEN_THRESHOLD ? covered : 0;
      root.style.setProperty('--kb', `${keyboard}px`);
      root.classList.toggle('kb-open', keyboard > 0);
      if (keyboard > 0) revealFocused();
    });
  };

  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
  window.addEventListener('orientationchange', update);

  // When a field inside a dialog gains focus, keep it in view once the
  // keyboard has finished animating in.
  document.addEventListener('focusin', (event) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest('.modal')) window.setTimeout(revealFocused, 320);
  });

  update();
}

function revealFocused(): void {
  const el = document.activeElement as HTMLElement | null;
  if (!el || !el.closest('.modal')) return;
  if (!/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
  el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
