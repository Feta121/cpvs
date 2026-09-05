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
      <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2.5 px-4 sm:items-end sm:right-4 sm:left-auto">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto animate-scaleIn relative flex w-full max-w-sm items-start gap-3 overflow-hidden rounded-xl2 border border-surface-line bg-surface/85 p-3.5 pl-4 text-ink-900 shadow-float backdrop-blur-xl ring-1 ring-inset ${
              t.kind === 'success' ? 'ring-vital-500/20' : 'ring-status-expired/25'
            }`}
          >
            {/* Colored rail down the leading edge — carries the success /
                error signal without tinting the whole panel, so the message
                text keeps full contrast on every theme. */}
            <span
              className={`absolute inset-y-0 left-0 w-1 ${
                t.kind === 'success' ? 'bg-gradient-to-b from-vital-400 to-vital-600' : 'bg-gradient-to-b from-status-expired to-status-late'
              }`}
            />
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ${
                t.kind === 'success'
                  ? 'bg-vital-500/12 text-vital-600 ring-vital-500/25'
                  : 'bg-status-expired/12 text-status-expired ring-status-expired/25'
              }`}
            >
              {t.kind === 'success' ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
            </span>
            <p className="flex-1 pt-0.5 text-sm font-medium leading-snug">{t.message}</p>
            <button
              onClick={() => remove(t.id)}
              aria-label="Dismiss"
              className="-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-ink-400 transition-colors hover:bg-surface-alt hover:text-ink-700"
            >
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