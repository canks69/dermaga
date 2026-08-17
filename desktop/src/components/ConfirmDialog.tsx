import { useEffect, useRef } from 'react';

interface ConfirmDialogProps {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-ink-950/40 p-6 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-xl border border-ink-200 bg-white p-5 shadow-panel dark:border-ink-700 dark:bg-ink-900"
      >
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-2 text-sm text-ink-600 dark:text-ink-400">{body}</p>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onCancel} className="btn-ghost">
            Cancel
          </button>
          <button ref={confirmRef} onClick={onConfirm} className="btn-secondary">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
