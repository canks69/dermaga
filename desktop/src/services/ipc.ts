/**
 * The renderer's only way out. Every call is a JSON-RPC method on the agent,
 * brokered by the Electron main process -- there is no HTTP client here and no
 * server to point one at.
 */

export interface Notification {
  method: string;
  params?: unknown;
}

interface Bridge {
  platform: string;
  isElectron: boolean;
  invoke: (method: string, params?: unknown) => Promise<unknown>;
  onNotify: (callback: (message: Notification) => void) => () => void;
  isFullScreen?: () => Promise<boolean>;
  onFullScreenChange?: (callback: (value: boolean) => void) => () => void;
}

declare global {
  interface Window {
    dermaga?: Bridge;
  }
}

export class NotRunningError extends Error {
  constructor() {
    super('Dermaga is not connected to its agent');
    this.name = 'NotRunningError';
  }
}

function bridge(): Bridge {
  const value = window.dermaga;
  if (!value) throw new NotRunningError();
  return value;
}

export function invoke<T>(method: string, params?: unknown): Promise<T> {
  return bridge().invoke(method, params) as Promise<T>;
}

/** Subscribes to everything the agent pushes; the caller filters by method. */
export function onNotify(callback: (message: Notification) => void): () => void {
  return bridge().onNotify(callback);
}

export interface StreamHandlers {
  onData: (chunk: string) => void;
  onEnd?: (error?: string) => void;
}

/**
 * Starts a streaming method and routes its chunks. The returned function
 * cancels the stream, which also stops the CLI process behind it.
 */
export async function openStream(
  method: string,
  params: unknown,
  handlers: StreamHandlers
): Promise<() => void> {
  const { streamId } = await invoke<{ streamId: string }>(method, params);

  const unsubscribe = onNotify((message) => {
    const payload = message.params as { id?: string; chunk?: string; error?: string } | undefined;
    if (!payload || payload.id !== streamId) return;

    if (message.method === 'stream.data' && typeof payload.chunk === 'string') {
      handlers.onData(payload.chunk);
      return;
    }

    if (message.method === 'stream.end') {
      unsubscribe();
      handlers.onEnd?.(payload.error);
    }
  });

  return () => {
    unsubscribe();
    void invoke('stream.cancel', { id: streamId }).catch(() => {
      // The stream may already have ended on its own.
    });
  };
}

/** Stream ids are needed for terminals, which also send input back. */
export async function openTerminalStream(
  params: { kind: 'container' | 'machine'; id: string },
  handlers: StreamHandlers
): Promise<{ streamId: string; close: () => void }> {
  const { streamId } = await invoke<{ streamId: string }>('terminal.open', params);

  const unsubscribe = onNotify((message) => {
    const payload = message.params as { id?: string; chunk?: string; error?: string } | undefined;
    if (!payload || payload.id !== streamId) return;

    if (message.method === 'stream.data' && typeof payload.chunk === 'string') {
      handlers.onData(payload.chunk);
      return;
    }

    if (message.method === 'stream.end') {
      unsubscribe();
      handlers.onEnd?.(payload.error);
    }
  });

  return {
    streamId,
    close: () => {
      unsubscribe();
      void invoke('stream.cancel', { id: streamId }).catch(() => {});
    },
  };
}
