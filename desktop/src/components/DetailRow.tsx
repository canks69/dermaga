import { useState, type ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';

/**
 * A titled group of label/value rows. Deliberately unboxed: the detail pages
 * read as one flat surface, with the same uppercase rule the list columns use
 * as their only separator. Boxing every group turned the page into a quilt.
 */
export function Section({
  title,
  action,
  children,
  span = false,
}: {
  title: string;
  /** Optional control beside the heading, e.g. a show/hide toggle. */
  action?: ReactNode;
  children: ReactNode;
  span?: boolean;
}) {
  return (
    <section className={`flex flex-col gap-2 ${span ? 'lg:col-span-2' : ''}`}>
      <div className="flex items-center justify-between gap-3 border-b border-ink-200 pb-1 dark:border-ink-700">
        <h2 className="label-caps">{title}</h2>
        {action}
      </div>
      <div className="flex flex-col gap-1.5">{children}</div>
    </section>
  );
}

interface RowProps {
  label: string;
  value?: string | number | null;
  mono?: boolean;
  /** Adds a click-to-copy button — for addresses, IDs and digests. */
  copyable?: boolean;
}

export function Row({ label, value, mono = false, copyable = false }: RowProps) {
  const [copied, setCopied] = useState(false);
  const text = value === undefined || value === null || value === '' ? '—' : String(value);
  const canCopy = copyable && text !== '—';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard access can be denied; the value is still selectable.
    }
  };

  return (
    <div className="row group">
      <span className="row-key text-xs">{label}</span>
      <span className="flex min-w-0 items-center gap-1.5">
        <span className={`row-value ${mono ? 'font-mono text-xs' : 'text-xs'}`} title={text}>
          {text}
        </span>
        {canCopy && (
          <button
            onClick={() => void copy()}
            className="shrink-0 text-ink-400 opacity-0 transition-opacity hover:text-brand-600 focus-visible:opacity-100 group-hover:opacity-100"
            title={`Copy ${label}`}
            aria-label={`Copy ${label}`}
          >
            {copied ? (
              <Check size={12} className="text-emerald-600" aria-hidden />
            ) : (
              <Copy size={12} aria-hidden />
            )}
          </button>
        )}
      </span>
    </div>
  );
}

/** A short on/off marker for the handful of boolean runtime settings. */
export function Flags({ flags }: { flags: { label: string; on: boolean }[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {flags.map(({ label, on }) => (
        <span
          key={label}
          className={`rounded px-1.5 py-0.5 text-tiny font-semibold ${
            on
              ? 'bg-brand-600/10 text-brand-700 dark:text-brand-400'
              : 'bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-400'
          }`}
        >
          {label}
        </span>
      ))}
    </div>
  );
}
