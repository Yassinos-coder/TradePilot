import { create } from 'zustand';

export type ToastTone = 'success' | 'error' | 'info';

export interface Toast {
  id: string;
  title: string;
  description?: string;
  tone: ToastTone;
}

interface ToastState {
  toasts: Toast[];
  push: (toast: Omit<Toast, 'id'> & { durationMs?: number }) => string;
  dismiss: (id: string) => void;
}

function createToastId() {
  return globalThis.crypto?.randomUUID?.() ?? `toast-${Date.now()}-${Math.random()}`;
}

export const useToastStore = create<ToastState>()((set, get) => ({
  toasts: [],
  push: ({ durationMs = 4_000, ...toast }) => {
    const id = createToastId();

    set((state) => ({
      toasts: [...state.toasts, { id, ...toast }].slice(-4),
    }));

    window.setTimeout(() => {
      get().dismiss(id);
    }, durationMs);

    return id;
  },
  dismiss: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id),
    })),
}));
