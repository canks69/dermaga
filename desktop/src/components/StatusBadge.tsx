import type { ContainerStatus } from '../types';

const STATUS_STYLES: Record<ContainerStatus, { dot: string; text: string; label: string }> = {
  running: {
    dot: 'bg-emerald-600',
    text: 'text-emerald-600',
    label: 'running',
  },
  stopped: {
    dot: 'bg-ink-400',
    text: 'text-ink-500 dark:text-ink-400',
    label: 'stopped',
  },
  stopping: { dot: 'bg-amber-500', text: 'text-amber-600', label: 'stopping' },
  paused: { dot: 'bg-amber-500', text: 'text-amber-600', label: 'paused' },
  unknown: {
    dot: 'bg-ink-400',
    text: 'text-ink-500 dark:text-ink-400',
    label: 'unknown',
  },
};

function styleFor(status: string) {
  return (
    STATUS_STYLES[status as ContainerStatus] ?? {
      ...STATUS_STYLES.unknown,
      label: status,
    }
  );
}

export function StatusDot({ status }: { status: string }) {
  const style = styleFor(status);

  return (
    <span
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${style.dot}`}
      role="img"
      aria-label={style.label}
      title={style.label}
    />
  );
}

export function StatusBadge({ status }: { status: string }) {
  const style = styleFor(status);

  return (
    <span className={`inline-flex items-center gap-2 text-sm ${style.text}`}>
      <StatusDot status={status} />
      {style.label}
    </span>
  );
}
