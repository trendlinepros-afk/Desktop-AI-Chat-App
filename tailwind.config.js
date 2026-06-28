/** @type {import('tailwindcss').Config} */
function token(name) {
  return `rgb(var(--c-${name}) / <alpha-value>)`;
}

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        app: token('app'),
        sidebar: token('sidebar'),
        chat: token('chat'),
        topbar: token('topbar'),
        surface: token('surface'),
        user: token('user'),
        accent: token('accent'),
        brain: token('brain'),
        idea: token('idea'),
        'text-primary': token('text-primary'),
        'text-muted': token('text-muted'),
        openai: token('openai'),
        gemini: token('gemini'),
        deepseek: token('deepseek'),
        edge: token('edge'),
        hover: token('hover'),
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', "'Segoe UI'", 'sans-serif'],
        mono: ["'JetBrains Mono'", "'Fira Code'", 'monospace'],
      },
      keyframes: {
        'brain-pulse': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(245, 158, 11, 0.5)' },
          '50%': { boxShadow: '0 0 0 6px rgba(245, 158, 11, 0)' },
        },
      },
      animation: {
        'brain-pulse': 'brain-pulse 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
