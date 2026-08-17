import { useEffect, useState } from 'react';

/**
 * Tracks the theme actually applied to the document, rather than the stored
 * preference, so "system" resolves correctly and live changes are picked up.
 */
export function useIsDark(): boolean {
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));

  useEffect(() => {
    const observer = new MutationObserver(() =>
      setIsDark(document.documentElement.classList.contains('dark'))
    );

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, []);

  return isDark;
}
