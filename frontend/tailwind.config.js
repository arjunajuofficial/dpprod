/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        noc: {
          bg:       '#0d1117',
          surface:  '#161b22',
          border:   '#21262d',
          muted:    '#7d8590',
          text:     '#e6edf3',
          green:    '#00d4aa',
          yellow:   '#e3b341',
          red:      '#f85149',
          blue:     '#79c0ff',
          orange:   '#ff7b72',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
};
