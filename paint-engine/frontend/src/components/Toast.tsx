import { useEffect, useState } from 'react';
import { onToast } from '../services/api';
import { Toast as ToastType } from '../types';

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastType[]>([]);

  useEffect(() => {
    return onToast((toast) => {
      setToasts(prev => [...prev, toast]);
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== toast.id));
      }, toast.duration || 6000);
    });
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-md">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`rounded-xl px-4 py-3 shadow-lg border backdrop-blur-sm ${
            toast.type === 'error' ? 'bg-red-900/90 border-red-500/30 text-red-100' :
            toast.type === 'success' ? 'bg-green-900/90 border-green-500/30 text-green-100' :
            'bg-gray-900/90 border-white/10 text-gray-100'
          }`}
        >
          <div className="font-medium text-sm">{toast.title}</div>
          <div className="text-xs opacity-80 mt-0.5">{toast.message}</div>
        </div>
      ))}
    </div>
  );
}
