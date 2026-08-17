import { useEffect } from 'react';
import { useSettingsStore } from '../store/settingsStore';

/**
 * Applies the persisted theme to the document root. "system" follows the macOS
 * appearance setting and updates live when the user flips it.
 */
export function useTheme() {
  const theme = useSettingsStore((s) => s.theme);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');

    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches);
      document.documentElement.classList.toggle('dark', dark);
      document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    };

    apply();

    if (theme !== 'system') return;
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);

  return theme;
}
