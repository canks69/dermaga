import { useEffect, useRef, useState } from 'react';
import { openStream } from '../services/ipc';
import type { LogEntry } from '../types';

const MAX_LINES = 2000;

export type StreamStatus = 'idle' | 'connecting' | 'streaming' | 'ended' | 'error';

/**
 * Follows a log stream from the agent. Cancelling it also stops the `--follow`
 * process behind it, so unmounting or switching targets leaves nothing running.
 */
export function useLogStream(method: string | null, params?: unknown) {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [status, setStatus] = useState<StreamStatus>('idle');
  const buffer = useRef<LogEntry[]>([]);

  // Params are rebuilt on every render; compare by value so the stream is not
  // torn down and reopened continuously.
  const key = params === undefined ? '' : JSON.stringify(params);

  useEffect(() => {
    // Switching target clears the pane before the new stream opens; keeping
    // the previous container's lines on screen would be worse.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEntries([]);
    buffer.current = [];

    if (!method) {
      setStatus('idle');
      return;
    }

    setStatus('connecting');
    let cancel: (() => void) | null = null;
    let closed = false;

    // Busy containers emit faster than React can render; batch on a timer.
    const flush = setInterval(() => {
      if (buffer.current.length === 0) return;
      const pending = buffer.current;
      buffer.current = [];
      setEntries((prev) => [...prev, ...pending].slice(-MAX_LINES));
    }, 120);

    void openStream(method, key ? (JSON.parse(key) as unknown) : undefined, {
      onData: (line) => {
        setStatus('streaming');
        buffer.current.push(parseLine(line));
      },
      onEnd: (error) => setStatus(error ? 'error' : 'ended'),
    })
      .then((stop) => {
        if (closed) stop();
        else cancel = stop;
      })
      .catch(() => setStatus('error'));

    return () => {
      closed = true;
      clearInterval(flush);
      cancel?.();
    };
  }, [method, key]);

  return { entries, status };
}

/** Splits a leading RFC3339-ish timestamp off a log line. */
function parseLine(line: string): LogEntry {
  const [first, ...rest] = line.trim().split(' ');

  if (rest.length > 0 && /^\d{4}-\d{2}-\d{2}/.test(first)) {
    return { timestamp: first, message: rest.join(' ') };
  }

  return { timestamp: '', message: line };
}
