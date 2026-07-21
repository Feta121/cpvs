import { createContext, useCallback, useContext, useState, ReactNode } from 'react';
import { CheckCircle2, XCircle, X } from 'lucide-react';

type ToastKind = 'success' | 'error';
interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastContextValue {
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const remove = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = nextId++;
    setToasts((t) => [...t, { id, kind, message }]);
    setTimeout(() => remove(id), 5000);
  }, [remove]);

  const showSuccess = useCallback((message: string) => push('success', message), [push]);
  const showError = useCallback((message: string) => push('error', message), [push]);

  return (
    <ToastContext.Provider value={{ showSuccess, showError }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2 px-4 sm:items-end sm:right-4 sm:left-auto">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-xl border p-3.5 shadow-card animate-fadeUp ${
              t.kind === 'success'
                ? 'border-vital-200 bg-surface text-ink-900'
                : 'border-status-expired/30 bg-surface text-ink-900'
            }`}
          >
            {t.kind === 'success' ? (
              <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-vital-600" />
            ) : (
              <XCircle size={18} className="mt-0.5 shrink-0 text-status-expired" />
            )}
            <p className="flex-1 text-sm">{t.message}</p>
            <button onClick={() => remove(t.id)} className="text-ink-300 hover:text-ink-500">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}