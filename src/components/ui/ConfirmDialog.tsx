import { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /** If set, this becomes a "strict" confirmation — the Confirm button
   * stays disabled until the admin types this exact text into a field.
   * Used for actions that are disruptive/hard to undo in a way a single
   * click doesn't adequately guard against (e.g. resetting a coordinator's
   * password immediately locks them out of their current one). */
  confirmText?: string;
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
  confirmText,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState('');

  if (!open) return null;

  const strict = !!confirmText;
  const canConfirm = !strict || typed === confirmText;

  function handleCancel() {
    setTyped('');
    onCancel();
  }

  function handleConfirm() {
    if (!canConfirm) return;
    setTyped('');
    onConfirm();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={handleCancel}>
      <div
        className="w-full max-w-md rounded-xl2 bg-surface p-6 shadow-glass"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div className={`flex h-10 w-10 items-center justify-center rounded-full ${danger ? 'bg-status-expired/10 text-status-expired' : 'bg-clinical-50 text-clinical-600'}`}>
            <AlertTriangle size={18} />
          </div>
          <button onClick={handleCancel} className="text-ink-300 hover:text-ink-500">
            <X size={18} />
          </button>
        </div>
        <h2 className="font-display text-base font-semibold text-ink-900">{title}</h2>
        <p className="mt-2 whitespace-pre-line text-sm text-ink-500">{message}</p>

        {strict && (
          <div className="mt-4">
            <label className="mb-1.5 block text-xs font-medium text-ink-700">
              Type <span className="font-mono font-semibold text-status-expired">{confirmText}</span> to confirm
            </label>
            <input
              autoFocus
              className="input-field"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && canConfirm && handleConfirm()}
            />
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={handleCancel} className="btn-secondary">{cancelLabel}</button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className={`${danger ? 'btn-primary !bg-status-expired hover:!bg-red-700' : 'btn-primary'} disabled:cursor-not-allowed disabled:opacity-40`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
