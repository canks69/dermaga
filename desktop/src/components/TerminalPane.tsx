import { useEffect, useRef, useState } from 'react';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { invoke, openTerminalStream } from '../services/ipc';
import { useIsDark } from '../hooks/useIsDark';

type SessionState = 'connecting' | 'connected' | 'closed' | 'error';

const STATE_LABEL: Record<SessionState, string> = {
  connecting: 'opening shell…',
  connected: 'connected',
  closed: 'session ended',
  error: 'could not connect',
};

// The terminal follows the app theme rather than always being a dark slab, so
// it sits on the page instead of looking pasted onto it.
/** The agent base64-encodes terminal bytes; xterm wants them back as text. */
function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function encodeBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

const ANSI = {
  red: '#ce1126',
  green: '#10b981',
  yellow: '#f59e0b',
  cyan: '#2a9d8f',
};

const LIGHT_THEME = {
  ...ANSI,
  background: '#ffffff',
  foreground: '#26262c',
  cursor: '#ce1126',
  cursorAccent: '#ffffff',
  selectionBackground: '#ce112633',
  black: '#26262c',
  blue: '#a60d1e',
  magenta: '#5f5f69',
  white: '#3a3a42',
  brightBlack: '#81818b',
};

const DARK_THEME = {
  ...ANSI,
  background: '#131317',
  foreground: '#f3f3f4',
  cursor: '#e2596a',
  cursorAccent: '#131317',
  selectionBackground: '#ce112655',
  black: '#26262c',
  red: '#e2596a',
  blue: '#e2596a',
  magenta: '#a8a8b0',
  white: '#fafafa',
  brightBlack: '#81818b',
};

/**
 * An interactive shell inside the container, over the exec WebSocket.
 *
 * The server runs the child on a real pty, so this is a full terminal: prompt,
 * line editing, colours and resize all work. Data is exchanged as binary
 * frames; window size changes go out as a JSON control frame.
 */
export function TerminalPane({
  target,
  disabled,
  disabledMessage = 'Start it to open a shell.',
}: {
  target: { kind: 'container' | 'machine'; id: string; user?: string };
  disabled: boolean;
  disabledMessage?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<SessionState>('connecting');
  const [attempt, setAttempt] = useState(0);
  const isDark = useIsDark();

  useEffect(() => {
    if (disabled || !hostRef.current) return;

    const term = new Terminal({
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: 12.5,
      lineHeight: 1.35,
      cursorBlink: true,
      theme: isDark ? DARK_THEME : LIGHT_THEME,
      allowProposedApi: true,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(hostRef.current);
    fit.fit();

    let streamId: string | null = null;
    let close: (() => void) | null = null;
    let disposed = false;

    const sendSize = () => {
      if (!streamId) return;
      void invoke('terminal.resize', { id: streamId, cols: term.cols, rows: term.rows }).catch(
        () => {
          // The session may already have ended.
        }
      );
    };

    void openTerminalStream(target, {
      // Terminal bytes travel base64 because JSON cannot carry them raw.
      onData: (chunk) => term.write(decodeBase64(chunk)),
      onEnd: (error) => setState(error ? 'error' : 'closed'),
    })
      .then((session) => {
        if (disposed) {
          session.close();
          return;
        }

        streamId = session.streamId;
        close = session.close;
        setState('connected');
        sendSize();
        term.focus();
      })
      .catch(() => setState('error'));

    const input = term.onData((data) => {
      if (!streamId) return;
      void invoke('terminal.input', { id: streamId, data: encodeBase64(data) }).catch(() => {
        setState('closed');
      });
    });

    // Refit on container resize, and tell the pty about the new geometry.
    const observer = new ResizeObserver(() => {
      try {
        fit.fit();
        sendSize();
      } catch {
        // The pane can be measured at zero size while switching tabs.
      }
    });
    observer.observe(hostRef.current);

    return () => {
      disposed = true;
      observer.disconnect();
      input.dispose();
      close?.();
      term.dispose();
    };
    // The target object is rebuilt on every render; its fields are what
    // actually identify the session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // The user is part of the session: changing it opens a new one.
  }, [target.kind, target.id, target.user, disabled, attempt, isDark]);

  if (disabled) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-sm text-ink-600 dark:text-ink-400">
        {disabledMessage}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-ink-200 pb-2 dark:border-ink-700">
        <span className="text-tiny text-ink-600 dark:text-ink-400">
          {STATE_LABEL[state]} · bash, falling back to sh
        </span>
        {(state === 'closed' || state === 'error') && (
          <button onClick={() => setAttempt((n) => n + 1)} className="btn-ghost px-3 py-1 text-xs">
            New session
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 py-2">
        <div ref={hostRef} className="selectable h-full w-full" />
      </div>
    </div>
  );
}
