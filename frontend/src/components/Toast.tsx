import { useEffect, useState } from 'react';
import { toastListeners } from '../utils/toast';
import type { Toast } from '../utils/toast';

export function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const handler = (t: Toast) => {
      setToasts((prev) => [...prev, t]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.id !== t.id));
      }, 3500);
    };
    toastListeners.add(handler);
    return () => { toastListeners.delete(handler); };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div style={{
      position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
      zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8,
      pointerEvents: 'none', width: '90%', maxWidth: 400,
    }}>
      {toasts.map((t) => (
        <div
          key={t.id}
          style={{
            background: t.type === 'success' ? '#2da44e' : '#e03131',
            color: '#fff',
            padding: '12px 20px',
            borderRadius: 12,
            fontSize: 14,
            fontWeight: 600,
            boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
            animation: 'toast-in 0.3s ease',
            pointerEvents: 'auto',
          }}
        >
          {t.type === 'success' ? '✅ ' : '❌ '}{t.message}
        </div>
      ))}
    </div>
  );
}
