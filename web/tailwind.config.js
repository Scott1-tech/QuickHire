/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#6366F1', 700: '#4F46E5', light: '#EEF2FF' },
        accent: '#14B8A6',
        info: '#2563EB',
        // Driver portal (navy/crimson)
        navy: { DEFAULT: '#0B2545', hero: '#0A1F3D' },
        crimson: { DEFAULT: '#A4193D', 700: '#8E1635' },
        success: '#16A34A',
        warn: '#F59E0B',
        danger: '#DC2626',
        purple: '#8B5CF6',
        slate: { DEFAULT: '#64748B' },
        surface: 'var(--surface)',
        bg: 'var(--bg)',
        line: 'var(--border)',
        ink: 'var(--text)',
        muted: 'var(--muted)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Sora', 'Inter', 'sans-serif'],
      },
      borderRadius: { xl: '12px' },
      boxShadow: {
        card: '0 8px 24px -12px rgba(15,23,42,.16)',
        pop: '0 16px 40px -12px rgba(15,23,42,.28)',
      },
    },
  },
  plugins: [],
};
