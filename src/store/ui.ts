import { create } from 'zustand';
import { newId } from '@/core/id';

export type ToastKind = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
  timeout: number;
}

export interface ConfirmRequest {
  id: string;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  danger: boolean;
  resolve: (ok: boolean) => void;
}

interface UIState {
  toasts: Toast[];
  confirms: ConfirmRequest[];
  sidebarOpen: boolean;
  stockAlert: string | null;
  showStockAlert: (message: string) => void;
  push: (kind: ToastKind, message: string, timeout?: number) => void;
  dismiss: (id: string) => void;
  ask: (req: Omit<ConfirmRequest, 'id' | 'resolve'>) => Promise<boolean>;
  answer: (id: string, ok: boolean) => void;
  setSidebar: (open: boolean) => void;
}

let stockTimer = 0;

export const useUI = create<UIState>()((set, get) => ({
  toasts: [],
  confirms: [],
  sidebarOpen: false,
  stockAlert: null,

  showStockAlert(message) {
    set({ stockAlert: message });
    window.clearTimeout(stockTimer);
    stockTimer = window.setTimeout(() => set({ stockAlert: null }), 6000);
  },

  push(kind, message, timeout = kind === 'error' ? 6000 : 3000) {
    const toast: Toast = { id: newId('t'), kind, message, timeout };
    set({ toasts: [...get().toasts, toast] });
    if (timeout > 0) window.setTimeout(() => get().dismiss(toast.id), timeout);
  },

  dismiss(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },

  ask(req) {
    return new Promise<boolean>((resolve) => {
      set({ confirms: [...get().confirms, { ...req, id: newId('c'), resolve }] });
    });
  },

  answer(id, ok) {
    const item = get().confirms.find((c) => c.id === id);
    item?.resolve(ok);
    set({ confirms: get().confirms.filter((c) => c.id !== id) });
  },

  setSidebar(open) {
    set({ sidebarOpen: open });
  },
}));

export const toast = {
  success: (m: string) => useUI.getState().push('success', m),
  error: (m: string) => useUI.getState().push('error', m),
  info: (m: string) => useUI.getState().push('info', m),
  warning: (m: string) => useUI.getState().push('warning', m),
};

export function confirmDialog(req: {
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
}): Promise<boolean> {
  return useUI.getState().ask({
    title: req.title,
    message: req.message ?? '',
    confirmLabel: req.confirmLabel,
    cancelLabel: req.cancelLabel,
    danger: req.danger ?? false,
  });
}
