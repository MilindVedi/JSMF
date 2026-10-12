import { create } from "zustand";

/** A small in-app toast queue (the web app uses sonner). */
export interface Toast {
  id: number;
  kind: "success" | "error" | "info";
  title: string;
  description?: string;
  action?: { label: string; onPress: () => void };
  onDismiss?: () => void;
  /** Milliseconds; 0 keeps it until dismissed. */
  duration: number;
}

interface ToastState {
  toasts: Toast[];
  show: (toast: Omit<Toast, "id" | "duration"> & { duration?: number }) => number;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  show: (toast) => {
    const id = nextId++;
    const duration = toast.duration ?? 3500;
    set((state) => ({ toasts: [...state.toasts.slice(-2), { ...toast, id, duration }] }));
    if (duration > 0) setTimeout(() => get().dismiss(id), duration);
    return id;
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

export const toast = {
  success: (title: string, description?: string) => useToastStore.getState().show({ kind: "success", title, description }),
  error: (title: string, description?: string) => useToastStore.getState().show({ kind: "error", title, description }),
  info: (title: string, description?: string) => useToastStore.getState().show({ kind: "info", title, description }),
};
