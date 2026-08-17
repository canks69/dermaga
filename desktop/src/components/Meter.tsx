interface MeterProps {
  /** 0-100. */
  value: number;
  label?: string;
  detail?: string;
  tone?: 'brand' | 'orange';
}

/** A thin allocation/usage bar. Turns amber then orange as it fills up. */
export function Meter({ value, label, detail, tone = 'brand' }: MeterProps) {
  const pct = Math.min(100, Math.max(0, value));

  const fill =
    tone === 'orange'
      ? 'bg-orange-600'
      : pct >= 90
        ? 'bg-brand-600'
        : pct >= 70
          ? 'bg-amber-500'
          : 'bg-emerald-600';

  return (
    <div className="flex flex-col gap-1.5">
      {(label || detail) && (
        <div className="row">
          {label && <span className="row-key">{label}</span>}
          {detail && <span className="row-value">{detail}</span>}
        </div>
      )}
      <div
        className="h-1 w-full overflow-hidden rounded-full bg-ink-200 dark:bg-ink-800"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${fill}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
