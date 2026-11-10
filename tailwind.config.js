const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // classes construites dynamiquement (tone-${x}, text-${x})
  safelist: [
    ...['good', 'warn', 'bad', 'accent', 'gold', 'mute'].flatMap((t) => [`tone-${t}`, `text-${t}`, `bg-${t}`, `border-${t}`])
  ],
  theme: {
    extend: {
      colors: {
        bg: token('bg'),
        surface: token('surface'),
        raised: token('raised'),
        hover: token('hover'),
        line: token('line'),
        ink: token('ink'),
        mute: token('mute'),
        faint: token('faint'),
        accent: token('accent'),
        accent2: token('accent2'),
        good: token('good'),
        warn: token('warn'),
        bad: token('bad'),
        gold: token('gold')
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', '"Segoe UI"', 'Roboto', 'system-ui', 'sans-serif'],
        num: ['ui-rounded', '"SF Pro Rounded"', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif']
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        rise: { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'none' } },
        pop: {
          '0%': { opacity: '0', transform: 'scale(0.86)' },
          '60%': { opacity: '1', transform: 'scale(1.05)' },
          '100%': { opacity: '1', transform: 'scale(1)' }
        },
        'toast-in': { from: { opacity: '0', transform: 'translateY(12px) scale(0.96)' }, to: { opacity: '1', transform: 'none' } },
        glow: { '0%, 100%': { opacity: '0.55' }, '50%': { opacity: '1' } },
        sheen: { from: { transform: 'translateX(-120%)' }, to: { transform: 'translateX(220%)' } }
      },
      animation: {
        'fade-in': 'fade-in 0.25s ease-out both',
        rise: 'rise 0.3s cubic-bezier(0.2, 0.8, 0.2, 1) both',
        pop: 'pop 0.32s cubic-bezier(0.2, 0.8, 0.2, 1) both',
        'toast-in': 'toast-in 0.28s cubic-bezier(0.2, 0.8, 0.2, 1) both',
        glow: 'glow 1.6s ease-in-out infinite',
        sheen: 'sheen 1.1s ease-out 0.15s both'
      }
    }
  },
  plugins: []
};
