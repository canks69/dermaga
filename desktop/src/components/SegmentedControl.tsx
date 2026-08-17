import type { LucideIcon } from 'lucide-react';

export interface Segment<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
}

interface SegmentedControlProps<T extends string> {
  segments: Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}

/**
 * One control rather than a row of separate buttons: the options are mutually
 * exclusive, so they read better joined inside a single track.
 */
export function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
  ariaLabel,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex h-7 w-fit shrink-0 self-start items-center rounded-full border border-ink-300 bg-ink-50 p-0.5 dark:border-ink-700 dark:bg-ink-900"
    >
      {segments.map(({ value: segment, label, icon: Icon }) => {
        const active = segment === value;

        return (
          <button
            key={segment}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(segment)}
            className={`inline-flex h-full items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors ${
              active
                ? 'bg-brand-600 text-white'
                : 'text-ink-600 hover:text-ink-800 dark:text-ink-400 dark:hover:text-ink-100'
            }`}
          >
            {Icon && <Icon size={13} aria-hidden />}
            {label}
          </button>
        );
      })}
    </div>
  );
}
