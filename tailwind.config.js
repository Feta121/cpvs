/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Every color below is a CSS variable (see src/index.css `:root` vs
        // `.dark`), so existing utility classes (bg-clinical-600,
        // text-ink-900, bg-status-present/10, etc.) automatically theme
        // without any component needing to change. Values follow the spec
        // palette: light primary #0F4C81 / accent #14B8A6, dark primary
        // #60A5FA / accent #2DD4BF, dark bg #0F172A / cards #1E293B /
        // sidebar #111827.
        surface: {
          DEFAULT: 'rgb(var(--surface) / <alpha-value>)',
          muted: 'rgb(var(--surface-muted) / <alpha-value>)',
          line: 'rgb(var(--surface-line) / <alpha-value>)',
          sidebar: 'rgb(var(--surface-sidebar) / <alpha-value>)',
        },
        ink: {
          900: 'rgb(var(--ink-900) / <alpha-value>)',
          700: 'rgb(var(--ink-700) / <alpha-value>)',
          500: 'rgb(var(--ink-500) / <alpha-value>)',
          300: 'rgb(var(--ink-300) / <alpha-value>)',
        },
        // "clinical" = the spec's Primary color (navy blue in light, sky
        // blue in dark). Name kept as-is to avoid touching every component.
        clinical: {
          50: 'rgb(var(--primary-50) / <alpha-value>)',
          100: 'rgb(var(--primary-100) / <alpha-value>)',
          200: 'rgb(var(--primary-200) / <alpha-value>)',
          300: 'rgb(var(--primary-300) / <alpha-value>)',
          400: 'rgb(var(--primary-400) / <alpha-value>)',
          500: 'rgb(var(--primary-500) / <alpha-value>)',
          600: 'rgb(var(--primary-600) / <alpha-value>)',
          700: 'rgb(var(--primary-700) / <alpha-value>)',
          800: 'rgb(var(--primary-700) / <alpha-value>)',
          900: 'rgb(var(--primary-700) / <alpha-value>)',
          950: 'rgb(var(--primary-700) / <alpha-value>)',
        },
        // "vital" = the spec's Accent color (teal).
        vital: {
          50: 'rgb(var(--accent-50) / <alpha-value>)',
          100: 'rgb(var(--accent-100) / <alpha-value>)',
          200: 'rgb(var(--accent-200) / <alpha-value>)',
          300: 'rgb(var(--accent-300) / <alpha-value>)',
          400: 'rgb(var(--accent-400) / <alpha-value>)',
          500: 'rgb(var(--accent-500) / <alpha-value>)',
          600: 'rgb(var(--accent-600) / <alpha-value>)',
          700: 'rgb(var(--accent-700) / <alpha-value>)',
          800: 'rgb(var(--accent-700) / <alpha-value>)',
          900: 'rgb(var(--accent-700) / <alpha-value>)',
        },
        status: {
          present: 'rgb(var(--success) / <alpha-value>)',
          late: 'rgb(var(--warning) / <alpha-value>)',
          verylate: 'rgb(var(--verylate) / <alpha-value>)',
          expired: 'rgb(var(--danger) / <alpha-value>)',
        },
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif'],
        body: ['"Inter"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
      backdropBlur: {
        xs: '2px',
      },
      boxShadow: {
        glass: '0 8px 32px 0 rgba(15, 61, 168, 0.08)',
        card: '0 1px 2px rgba(11,31,58,0.04), 0 8px 24px -8px rgba(11,31,58,0.10)',
        lift: '0 12px 28px -8px rgba(15, 76, 129, 0.25)',
      },
      borderRadius: {
        xl2: '1rem', // 16px — within the spec's 14-18px range
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: 0, transform: 'translateY(8px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
        pulseRing: {
          '0%': { boxShadow: '0 0 0 0 rgba(15,160,128,0.35)' },
          '100%': { boxShadow: '0 0 0 14px rgba(15,160,128,0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-400px 0' },
          '100%': { backgroundPosition: '400px 0' },
        },
        ripple: {
          '0%': { transform: 'scale(0)', opacity: 0.45 },
          '100%': { transform: 'scale(2.5)', opacity: 0 },
        },
      },
      animation: {
        fadeUp: 'fadeUp 0.4s ease-out both',
        pulseRing: 'pulseRing 1.8s ease-out infinite',
        shimmer: 'shimmer 1.6s ease-in-out infinite',
        ripple: 'ripple 0.6s ease-out',
      },
    },
  },
  plugins: [],
};
