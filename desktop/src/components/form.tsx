import { Plus, X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';

/** A centred modal with an escape hatch and a scrolling body. */
export function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-ink-950/40 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={`flex max-h-full w-full flex-col overflow-hidden rounded-xl border border-ink-200 bg-white shadow-panel dark:border-ink-700 dark:bg-ink-900 ${
          wide ? 'max-w-3xl' : 'max-w-md'
        }`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-ink-200 p-5 dark:border-ink-700">
          <div>
            <h2 className="text-base font-semibold">{title}</h2>
            {subtitle && <p className="mt-1 text-xs text-ink-600 dark:text-ink-400">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="btn-icon" aria-label="Close">
            <X size={16} aria-hidden />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-5">{children}</div>

        <div className="flex justify-end gap-2 border-t border-ink-200 p-4 dark:border-ink-700">
          {footer}
        </div>
      </div>
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold">{label}</span>
      {children}
      {hint && <span className="text-tiny text-ink-600 dark:text-ink-400">{hint}</span>}
    </label>
  );
}

export function Fieldset({
  legend,
  hint,
  onAdd,
  addLabel,
  children,
}: {
  legend: string;
  hint?: string;
  onAdd: () => void;
  addLabel: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <legend className="text-xs font-semibold">{legend}</legend>
        <button type="button" onClick={onAdd} className="btn-ghost px-2 py-1 text-xs">
          <Plus size={13} aria-hidden />
          {addLabel}
        </button>
      </div>
      {hint && <p className="text-tiny text-ink-600 dark:text-ink-400">{hint}</p>}
      <div className="flex flex-col gap-2">{children}</div>
    </fieldset>
  );
}

/** One removable row inside a Fieldset. */
export function Row({ onRemove, children }: { onRemove: () => void; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      {children}
      <button
        type="button"
        onClick={onRemove}
        className="btn-icon h-8 w-8 shrink-0"
        aria-label="Remove row"
      >
        <X size={14} aria-hidden />
      </button>
    </div>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex h-7 items-center gap-2 text-xs">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-brand-600"
      />
      {label}
    </label>
  );
}
