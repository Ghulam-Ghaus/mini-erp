import { X } from 'lucide-react';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

export type ToastTone = 'neutral' | 'success' | 'warning' | 'danger';

export interface ToastItem {
  readonly id: number;
  readonly title: string;
  readonly description?: string;
  readonly tone?: ToastTone;
}

export interface ToastContextValue {
  readonly showToast: (toast: Omit<ToastItem, 'id'>) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const toneClasses: Record<ToastTone, string> = {
  neutral: 'border-[#d6d3c9] bg-white text-[#1f1e1b]',
  success: 'border-[#cce3d5] bg-[#f1f8f4] text-[#2c6b48]',
  warning: 'border-[#ead8b8] bg-[#fcf7ee] text-[#8f5f1a]',
  danger: 'border-[#ead0cd] bg-[#fbf2f1] text-[#9e3b33]',
};

export function ToastProvider({ children }: { readonly children: ReactNode }) {
  const [toasts, setToasts] = useState<readonly ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const showToast = useCallback(
    (toast: Omit<ToastItem, 'id'>) => {
      const id = Date.now() + Math.floor(Math.random() * 1000);
      setToasts((prev) => [...prev, { ...toast, id }]);
      setTimeout(() => dismiss(id), 3500);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 end-4 z-50 flex flex-col gap-2"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex w-80 items-start justify-between gap-2 rounded border px-3 py-2.5 text-xs shadow-sm ${
              toneClasses[t.tone ?? 'neutral']
            }`}
          >
            <div>
              <p className="font-semibold">{t.title}</p>
              {t.description && <p className="mt-0.5 opacity-85">{t.description}</p>}
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="opacity-70 hover:opacity-100 cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used inside a ToastProvider');
  }
  return ctx;
}
