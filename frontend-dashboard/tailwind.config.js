/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        cyber: {
          dark: '#0a0e1a',
          card: '#10182d',
          border: 'rgba(255, 255, 255, 0.08)',
          cyan: '#06b6d4',
          indigo: '#6366f1',
          purple: '#a855f7',
          rose: '#f43f5e',
          emerald: '#10b981',
        }
      }
    },
  },
  plugins: [],
}
