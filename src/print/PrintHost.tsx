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

/** 非表示の `#print-root` にレシート DOM を展開し、ブラウザ標準の印刷ダイアログを呼び出す。
 *  ポップアップブロックを回避し、プリンタ未接続時は PDF 保存も選択できる。 */
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
    // レイアウト確定まで2フレーム待機してから印刷ダイアログを開く
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
