import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Styled replacement for window.confirm() — used for every destructive
 * action (deleting hospitals, students, rotations, announcements,
 * exceptions, special practice days). Native browser confirm() dialogs
 * can't be styled and look jarring against the rest of the app.
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  danger = true,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div
        className="w-full max-w-md rounded-xl2 bg-surface p-6 shadow-glass"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div className={`flex h-10 w-10 items-center justify-center rounded-full ${danger ? 'bg-status-expired/10 text-status-expired' : 'bg-clinical-50 text-clinical-600'}`}>
            <AlertTriangle size={18} />
          </div>
          <button onClick={onCancel} className="text-ink-300 hover:text-ink-500">
            <X size={18} />
          </button>
        </div>
        <h2 className="font-display text-base font-semibold text-ink-900">{title}</h2>
        <p className="mt-2 whitespace-pre-line text-sm text-ink-500">{message}</p>
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onCancel} className="btn-secondary">{cancelLabel}</button>
          <button
            onClick={onConfirm}
            className={danger ? 'btn-primary !bg-status-expired hover:!bg-red-700' : 'btn-primary'}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
