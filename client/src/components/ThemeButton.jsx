import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext.jsx';

export default function ThemeButton({ className = '' }) {
  const { theme, toggleTheme } = useTheme();
  const nextTheme = theme === 'dark' ? 'light' : 'dark';
  const Icon = theme === 'dark' ? Sun : Moon;

  return (
    <button
      className={`icon-button theme-button ${className}`.trim()}
      type="button"
      onClick={toggleTheme}
      aria-label={`Switch to ${nextTheme} mode`}
      title={`Switch to ${nextTheme} mode`}
    >
      <Icon aria-hidden="true" size={18} />
      <span className="sr-only">Switch to {nextTheme} mode</span>
    </button>
  );
}
