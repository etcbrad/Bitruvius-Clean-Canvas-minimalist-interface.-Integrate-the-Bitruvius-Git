/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ['"JetBrains Mono"', 'monospace'],
        archaic: ['"VT323"', 'monospace'],
      },
      backgroundImage: {
        'triangle-grid': `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3e%3cpath d='M12 0 L0 12 L12 24 L24 12 Z M0 0 L12 24 L24 0 Z' stroke='rgba(20, 20, 20, 0.1)' stroke-width='1' fill='none'/%3e%3c/svg%3e")`,
      },
      colors: {
        paper: '#2D2D2D',
        ink: '#D1D5DB',
        'mono-light': '#E5E7EB',
        'mono-mid': '#9CA3AF',
        'mono-dark': '#2D2D2D',
        'mono-darker': '#2D2D2D',
        selection: '#D1D5DB',
        'selection-light': '#E5E7EB',
        'selection-super-light': '#F3F4F6',
        'limb-highlight': '#9CA3AF',
        'accent-purple': '#9CA3AF',
        'accent-green': '#9CA3AF',
        'accent-red': '#F87171',
        'shell': '#2D2D2D',
        'black': '#000000',
        'ridge': '#333333',
        'focus-ring': '#E5E7EB',
        'olive': '#000000',
      },
      animation: {
        'terminal-boot': 'terminal-boot 2s steps(1, end) forwards',
      },
      keyframes: {
        'terminal-boot': {
          '0%': { opacity: '0' },
          '10%, 20%, 30%, 50%, 70%, 90%': { opacity: '1' },
          '15%, 25%, 55%, 75%': { opacity: '0.3' },
          '100%': { opacity: '0' },
        }
      }
    }
  },
  plugins: [],
}
