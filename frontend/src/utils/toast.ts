interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error';
}

let nextId = 0;
export const toastListeners: Set<(t: Toast) => void> = new Set();

export function showToast(message: string, type: 'success' | 'error' = 'success') {
  const toast: Toast = { id: nextId++, message, type };
  toastListeners.forEach((fn) => fn(toast));
}

export type { Toast };
