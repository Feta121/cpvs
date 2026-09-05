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
    <div className="modal-overlay" onClick={handleCancel}>
      <div className="modal-panel max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-start justify-between gap-4">
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl2 bg-gradient-to-br ring-1 ring-inset ${
              danger
                ? 'from-status-expired/25 to-status-expired/5 text-status-expired ring-status-expired/30'
                : 'from-clinical-500/22 to-vital-500/10 text-clinical-600 ring-clinical-500/25'
            }`}
          >
            <AlertTriangle size={19} strokeWidth={2.25} />
          </div>
          <button onClick={handleCancel} className="btn-icon h-8 w-8" aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <h2 className="font-display text-lg font-semibold tracking-[-0.01em] text-ink-900">{title}</h2>
        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink-500">{message}</p>

        {strict && (
          <div className="inset-panel mt-5 p-4">
            <label className="mb-2 block text-xs font-medium text-ink-700">
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

        <div className="mt-6 flex justify-end gap-2.5">
          <button onClick={handleCancel} className="btn-secondary">{cancelLabel}</button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className={`${danger ? 'btn-danger' : 'btn-primary'} disabled:cursor-not-allowed disabled:opacity-40`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
