import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { create } from 'zustand';

interface PrintState {
  node: ReactNode | null;
  show: (node: ReactNode) => void;
  clear: () => void;
}

const usePrintStore = create<PrintState>()((set) => ({
  node: null,
  show: (node) => set({ node }),
  clear: () => set({ node: null }),
}));

/** Renders the receipt into a hidden `#print-root` and calls the browser's own
 *  print dialog. No popup window, so nothing is blocked, and the user can pick
 *  "Save as PDF" when there is no thermal printer attached. */
export function printDocument(node: ReactNode): void {
  usePrintStore.getState().show(node);
}

export function PrintHost() {
  const node = usePrintStore((s) => s.node);
  const clear = usePrintStore((s) => s.clear);

  useEffect(() => {
    if (!node) return;
    const done = () => clear();
    window.addEventListener('afterprint', done);
    // Two frames so the browser has laid the receipt out before printing.
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
    const safety = window.setTimeout(done, 60_000);
    return () => {
      window.removeEventListener('afterprint', done);
      cancelAnimationFrame(raf);
      window.clearTimeout(safety);
    };
  }, [node, clear]);

  const root = document.getElementById('print-root');
  if (!node || !root) return null;
  return createPortal(node, root);
}
