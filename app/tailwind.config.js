/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Основной акцент — тёплый зелёный: еда, свежесть, «всё в порядке»
        brand: {
          50: '#f0fdf5',
          100: '#dcfce8',
          200: '#bbf7d1',
          300: '#86efad',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
        },
        // Поверхности: тёплый нейтральный, не «больничный» серый
        surface: {
          50: '#fafaf9',
          100: '#f5f5f4',
          200: '#e7e5e4',
          300: '#d6d3d1',
          400: '#a8a29e',
          500: '#78716c',
          600: '#57534e',
          700: '#44403c',
          800: '#292524',
          900: '#1c1917',
          950: '#0f0e0d',
        },
      },
      fontSize: {
        // Крупные цифры для сумм — главный визуальный якорь
        money: ['2.75rem', { lineHeight: '1', letterSpacing: '-0.03em', fontWeight: '700' }],
        'money-sm': ['1.75rem', { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '700' }],
      },
      borderRadius: {
        card: '1.25rem',
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,0.04), 0 8px 24px -8px rgba(0,0,0,0.08)',
        lift: '0 2px 4px rgba(0,0,0,0.05), 0 16px 40px -12px rgba(0,0,0,0.16)',
      },
      transitionTimingFunction: {
        smooth: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [],
};
