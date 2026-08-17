import { AlertTriangle, RefreshCw } from 'lucide-react';
import type { ConnectionState } from '../hooks/useEventStream';
import type { BuildInfo, SystemStatus } from '../types';

interface StatusBarProps {
  build: BuildInfo | null;
  system: SystemStatus | null;
  connection: ConnectionState;
  error: string | null;
}

/**
 * The one place problems are reported. Modal banners pushed the page around
 * every time the connection blinked; a fixed bar at the bottom stays out of the
 * way until something is actually wrong, then colours itself.
 */
export function StatusBar({ build, system, connection, error }: StatusBarProps) {
  const disconnected = connection === 'disconnected';

  return (
    <footer className="flex h-6 shrink-0 items-center justify-between gap-4 border-t border-ink-200 bg-ink-50 px-3 text-tiny dark:border-ink-800 dark:bg-ink-900">
      {/* Only problems live here, as coloured text -- a filled block at the
          bottom of the window reads as an alarm even when nothing is wrong.
          Services being down takes over the whole page instead. */}
      <div className="flex min-w-0 items-center gap-3">
        {disconnected && (
          <Item tone="warning" icon={RefreshCw} label="Lost contact with the Dermaga agent" />
        )}
        {error && <Item tone="warning" icon={AlertTriangle} label={error} />}
      </div>

      <div className="flex shrink-0 items-center gap-3 text-ink-500">
        {system?.cliVersion && (
          <span title="Apple Container CLI">container {system.cliVersion}</span>
        )}
        {build && (
          <span title={buildTitle(build)}>
            v{build.version}
            {build.commit && build.commit !== 'unknown' && (
              <span className="ml-1.5 font-mono opacity-70">{build.commit}</span>
            )}
          </span>
        )}
      </div>
    </footer>
  );
}

/** The full build stamp, for the tooltip. */
function buildTitle(build: BuildInfo): string {
  const parts = [`Dermaga ${build.version}`];
  if (build.commit && build.commit !== 'unknown') parts.push(`commit ${build.commit}`);
  if (build.date) parts.push(`built ${build.date}`);
  return parts.join(' · ');
}

function Item({
  tone,
  icon: Icon,
  label,
}: {
  tone: 'warning' | 'danger';
  icon: typeof AlertTriangle;
  label: string;
}) {
  const tones = {
    warning: 'text-amber-600 dark:text-amber-500',
    danger: 'text-brand-600 dark:text-brand-400',
  };

  return (
    <span className={`flex min-w-0 items-center gap-1.5 ${tones[tone]}`}>
      <Icon size={11} className="shrink-0" aria-hidden />
      <span className="truncate">{label}</span>
    </span>
  );
}
