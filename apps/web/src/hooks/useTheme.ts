import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const KEY = 'imaging.theme';

function storedTheme(): Theme | null {
  try {
    const value = window.localStorage.getItem(KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

function systemTheme(): Theme {
  const prefersDark =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  return prefersDark ? 'dark' : 'light';
}

/**
 * The colour theme: the user's saved choice if there is one, otherwise the
 * operating system preference. The choice is applied as `data-theme` on the
 * root element so plain CSS variables do the rest.
 */
export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>(() => storedTheme() ?? systemTheme());

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      try {
        window.localStorage.setItem(KEY, next);
      } catch {
        // Storage can be blocked; the theme still applies for this session.
      }
      return next;
    });
  }, []);

  return { theme, toggle };
}
