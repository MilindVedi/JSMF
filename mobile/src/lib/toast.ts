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
/** On screen at once, as sonner's default. */
const MAX_TOASTS = 3;

/**
 * Adds a toast, keeping at most MAX_TOASTS by dropping the oldest *timed*
 * one. A persistent toast (duration 0, e.g. the minor-terms-update notice) is
 * never dropped unseen — sonner keeps those too — so if only persistent ones
 * are left, the list may run past the cap until they are dismissed.
 */
function withToast(toasts: Toast[], added: Toast): Toast[] {
  let list = [...toasts, added];
  while (list.length > MAX_TOASTS) {
    const oldestTimed = list.findIndex((t) => t.duration > 0 && t.id !== added.id);
    if (oldestTimed === -1) break;
    list = list.filter((_, i) => i !== oldestTimed);
  }
  return list;
}

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  show: (toast) => {
    const id = nextId++;
    const duration = toast.duration ?? 3500;
    set((state) => ({ toasts: withToast(state.toasts, { ...toast, id, duration }) }));
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
