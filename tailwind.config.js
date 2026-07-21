/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // surface & ink are defined as CSS variables (see src/index.css,
        // `:root` vs `.dark`) rather than fixed hex values, so every existing
        // utility class using them (bg-surface-muted, text-ink-900,
        // border-surface-line, etc.) automatically swaps between light and
        // dark without any component needing to change. Brand colors
        // (clinical/vital/status) intentionally stay fixed hex across both
        // themes — they're the CPVS brand identity, not a light/dark concern.
        surface: {
          DEFAULT: 'rgb(var(--surface) / <alpha-value>)',
          muted: 'rgb(var(--surface-muted) / <alpha-value>)',
          line: 'rgb(var(--surface-line) / <alpha-value>)',
        },
        ink: {
          900: 'rgb(var(--ink-900) / <alpha-value>)',
          700: 'rgb(var(--ink-700) / <alpha-value>)',
          500: 'rgb(var(--ink-500) / <alpha-value>)',
          300: 'rgb(var(--ink-300) / <alpha-value>)',
        },
        // Core clinical palette — a deep clinical blue paired with a
        // living, oxygenated teal-green (referencing pulse-ox / vitals).
        clinical: {
          50: '#eef5ff',
          100: '#dcebff',
          200: '#b7d6ff',
          300: '#83b8ff',
          400: '#4a91ff',
          500: '#1f6dfa',
          600: '#0f52d6',
          700: '#0d3fa8',
          800: '#0f3585',
          900: '#122d63',
          950: '#0a1a3d',
        },
        vital: {
          50: '#effcf8',
          100: '#c9f6e8',
          200: '#94ecd3',
          300: '#57d9b8',
          400: '#26bd9c',
          500: '#0fa080',
          600: '#0a8069',
          700: '#0a6656',
          800: '#0b5245',
          900: '#0b443a',
        },
        status: {
          present: '#0fa080',
          late: '#d69e0a',
          verylate: '#e17a1f',
          expired: '#dc3b3b',
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
      },
      borderRadius: {
        xl2: '1.25rem',
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
      },
      animation: {
        fadeUp: 'fadeUp 0.5s ease-out both',
        pulseRing: 'pulseRing 1.8s ease-out infinite',
      },
    },
  },
  plugins: [],
};