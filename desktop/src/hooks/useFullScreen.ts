import { useEffect, useState } from 'react';

/**
 * True while the window is in macOS fullscreen. This is not the HTML Fullscreen
 * API — the green button is a native window state — so it comes from the main
 * process. In a browser (dev on :3000 without Electron) it stays false.
 */
export function useFullScreen(): boolean {
  const [fullScreen, setFullScreen] = useState(false);

  useEffect(() => {
    const bridge = window.dermaga;
    if (!bridge?.onFullScreenChange) return;

    void bridge.isFullScreen?.().then(setFullScreen);

    return bridge.onFullScreenChange(setFullScreen);
  }, []);

  return fullScreen;
}
