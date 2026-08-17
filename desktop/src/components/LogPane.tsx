import { useEffect, useMemo, useRef, useState } from 'react';
import { useLogStream, type StreamStatus } from '../hooks/useLogStream';

const STATUS_LABEL: Record<StreamStatus, string> = {
  idle: 'idle',
  connecting: 'connecting…',
  streaming: 'streaming',
  ended: 'stream ended',
  error: 'disconnected',
};

// The runtime writes no log file until the thing has run at least once, and it
// reports that as a hard error rather than as empty output. Printed raw --
// NSCocoaErrorDomain, a file path, a nested NSUnderlyingError -- it reads like a
// crash, so recognise it and explain it instead.
const NO_LOG_FILE = /failed to (get|open).{0,40}logs?|stdio\.log/i;

interface LogPaneProps {
  /** JSON-RPC method that opens the stream, e.g. containers.logs. */
  method: string;
  params: unknown;
  /** Extra controls rendered next to the filter, e.g. a boot-log switch. */
  controls?: React.ReactNode;
  /** Explains why there is no log file yet, when the runtime says there isn't. */
  missingHint?: React.ReactNode;
}

export function LogPane({ method, params, controls, missingHint }: LogPaneProps) {
  const { entries, status } = useLogStream(method, params);

  const [filter, setFilter] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const visible = useMemo(() => {
    if (!filter.trim()) return entries;
    const needle = filter.toLowerCase();
    return entries.filter((entry) => entry.message.toLowerCase().includes(needle));
  }, [entries, filter]);

  const noLogFile = useMemo(
    () => entries.length > 0 && entries.every((entry) => NO_LOG_FILE.test(entry.message)),
    [entries]
  );

  useEffect(() => {
    if (!autoScroll) return;
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [visible, autoScroll]);

  // Scrolling up pauses the follow; returning to the bottom resumes it.
  const onScroll = () => {
    const node = scrollRef.current;
    if (!node) return;
    setAutoScroll(node.scrollHeight - node.scrollTop - node.clientHeight < 40);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-200 pb-2 dark:border-ink-700">
        <span className="text-tiny text-ink-600 dark:text-ink-400">
          {STATUS_LABEL[status]} · {entries.length} lines
        </span>

        <div className="flex items-center gap-3">
          {controls}
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter…"
            aria-label="Filter log lines"
            className="input w-40"
          />
          <label className="flex items-center gap-2 text-xs text-ink-600 dark:text-ink-400">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="accent-brand-600"
            />
            Follow
          </label>
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="selectable -mr-5 min-h-0 flex-1 overflow-auto py-2 pr-5 font-mono text-xs leading-relaxed"
      >
        {noLogFile ? (
          <div className="max-w-prose font-sans text-sm text-ink-500">
            <p className="text-ink-700 dark:text-ink-300">No logs yet.</p>
            <p className="mt-1">
              {missingHint ?? 'Nothing has been written here yet — there is no log file to read.'}
            </p>
          </div>
        ) : visible.length === 0 ? (
          <p className="text-ink-500">
            {entries.length === 0 ? 'Waiting for output…' : 'No lines match the filter.'}
          </p>
        ) : (
          visible.map((entry, index) => (
            <p key={index} className="whitespace-pre-wrap break-all">
              {entry.timestamp && (
                <span className="mr-2 text-brand-700 dark:text-brand-400">{entry.timestamp}</span>
              )}
              {entry.message}
            </p>
          ))
        )}
      </div>
    </div>
  );
}
