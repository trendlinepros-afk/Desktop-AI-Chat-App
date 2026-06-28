/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        app: '#0a0a0b',
        sidebar: '#0f0f10',
        chat: '#111113',
        topbar: '#18181b',
        surface: '#1c1c1f',
        user: '#1a2535',
        accent: '#6366f1',
        brain: '#f59e0b',
        idea: '#10b981',
        'text-primary': '#e4e4e7',
        'text-muted': '#71717a',
        openai: '#10a37f',
        gemini: '#4285f4',
        deepseek: '#7c3aed',
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
