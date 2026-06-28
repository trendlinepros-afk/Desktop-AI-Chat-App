import { useThemeStore } from '../store/themeStore';

export function ThemeToggle() {
  const theme = useThemeStore((s) => s.theme);
  const toggle = useThemeStore((s) => s.toggle);

  return (
    <button
      onClick={toggle}
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label="Toggle light/dark mode"
      className="rounded-lg border border-edge px-2.5 py-1 text-sm text-text-muted transition hover:bg-hover hover:text-text-primary"
    >
      {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
    </button>
  );
}
