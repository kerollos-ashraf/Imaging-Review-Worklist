import type { ReactElement } from 'react';
import type { Theme } from '../hooks/useTheme';

interface Props {
  theme: Theme;
  onToggle: () => void;
}

function SunIcon(): ReactElement {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="4.5" fill="currentColor" />
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8" />
      </g>
    </svg>
  );
}

function MoonIcon(): ReactElement {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" fill="currentColor" />
    </svg>
  );
}

export function ThemeToggle({ theme, onToggle }: Props): ReactElement {
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button type="button" className="icon-button" onClick={onToggle}>
      {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
      <span className="visually-hidden">Switch to {next} theme</span>
    </button>
  );
}
