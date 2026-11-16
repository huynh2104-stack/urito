/* On phones the on-screen keyboard slides up over the page without resizing
 * it (Chrome's default since v108, and always on iOS Safari), so a bottom
 * sheet with an autofocused input - "Open shift", "Cash in", "Custom item" -
 * ends up hidden behind the keys. We measure the keyboard through the Visual
 * Viewport API and expose it as the CSS variable --kb; the dialog CSS lifts
 * the sheet by exactly that much. */

const OPEN_THRESHOLD = 80; // px: smaller gaps are browser toolbars, not a keyboard

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
