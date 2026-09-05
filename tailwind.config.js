/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Every color below is a CSS variable (see src/index.css `:root` vs
        // `.dark` vs `.theme-aether`), so existing utility classes
        // (bg-clinical-600, text-ink-900, bg-status-present/10, etc.)
        // automatically theme without any component needing to change.
        surface: {
          DEFAULT: 'rgb(var(--surface) / <alpha-value>)',
          alt: 'rgb(var(--surface-alt) / <alpha-value>)',
          muted: 'rgb(var(--surface-muted) / <alpha-value>)',
          line: 'rgb(var(--surface-line) / <alpha-value>)',
          sidebar: 'rgb(var(--surface-sidebar) / <alpha-value>)',
        },
        // 600 and 400 were already being used in markup (LiveClock, Select,
        // Settings, PermissionsFieldset) without ever being defined here, so
        // those utilities emitted nothing at all. Now they exist.
        ink: {
          900: 'rgb(var(--ink-900) / <alpha-value>)',
          700: 'rgb(var(--ink-700) / <alpha-value>)',
          600: 'rgb(var(--ink-600) / <alpha-value>)',
          500: 'rgb(var(--ink-500) / <alpha-value>)',
          400: 'rgb(var(--ink-400) / <alpha-value>)',
          300: 'rgb(var(--ink-300) / <alpha-value>)',
        },
        // Text color to use ON TOP of the primary-600 action color (buttons,
        // active states). White on light; near-black on dark/Aether, whose
        // primaries are light blue / bright lime. This variable exists
        // precisely so .btn-primary never has to hardcode `text-white`.
        onPrimary: 'rgb(var(--on-primary) / <alpha-value>)',
        onAccent: 'rgb(var(--on-accent) / <alpha-value>)',
        // "clinical" = the spec's Primary color (navy in light, sky blue in
        // dark, lime in Aether). Name kept as-is to avoid touching every
        // component. 800/900/950 used to alias to --primary-700; they are
        // real, distinct steps now, which is what lets gradients and hover
        // states have actual depth.
        clinical: {
          50: 'rgb(var(--primary-50) / <alpha-value>)',
          100: 'rgb(var(--primary-100) / <alpha-value>)',
          200: 'rgb(var(--primary-200) / <alpha-value>)',
          300: 'rgb(var(--primary-300) / <alpha-value>)',
          400: 'rgb(var(--primary-400) / <alpha-value>)',
          500: 'rgb(var(--primary-500) / <alpha-value>)',
          600: 'rgb(var(--primary-600) / <alpha-value>)',
          700: 'rgb(var(--primary-700) / <alpha-value>)',
          800: 'rgb(var(--primary-800) / <alpha-value>)',
          900: 'rgb(var(--primary-900) / <alpha-value>)',
          950: 'rgb(var(--primary-950) / <alpha-value>)',
        },
        // "vital" = the spec's Accent color (teal; cyan in Aether).
        vital: {
          50: 'rgb(var(--accent-50) / <alpha-value>)',
          100: 'rgb(var(--accent-100) / <alpha-value>)',
          200: 'rgb(var(--accent-200) / <alpha-value>)',
          300: 'rgb(var(--accent-300) / <alpha-value>)',
          400: 'rgb(var(--accent-400) / <alpha-value>)',
          500: 'rgb(var(--accent-500) / <alpha-value>)',
          600: 'rgb(var(--accent-600) / <alpha-value>)',
          700: 'rgb(var(--accent-700) / <alpha-value>)',
          800: 'rgb(var(--accent-800) / <alpha-value>)',
          900: 'rgb(var(--accent-900) / <alpha-value>)',
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
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      letterSpacing: {
        tightest: '-0.03em',
      },
      backdropBlur: {
        xs: '2px',
      },
      // Elevation is themed: --shadow-rgb is a soft blue on light and pure
      // black on the dark themes, and --sh-a* scale the opacities up on dark
      // (where a light-blue 8% shadow is simply invisible). --hl is the thin
      // lit top rim that makes a surface read as physical.
      boxShadow: {
        hairline: 'inset 0 0 0 1px rgb(var(--surface-line) / 0.8)',
        card:
          'inset 0 1px 0 var(--hl), 0 1px 2px rgb(var(--shadow-rgb) / var(--sh-a1)), 0 10px 26px -14px rgb(var(--shadow-rgb) / var(--sh-a2))',
        glass:
          'inset 0 1px 0 var(--hl), 0 2px 6px rgb(var(--shadow-rgb) / var(--sh-a1)), 0 18px 44px -20px rgb(var(--shadow-rgb) / var(--sh-a2))',
        lift:
          'inset 0 1px 0 var(--hl), 0 18px 38px -16px rgb(var(--shadow-rgb) / var(--sh-a3))',
        float:
          'inset 0 1px 0 var(--hl), 0 32px 70px -24px rgb(var(--shadow-rgb) / var(--sh-a3)), 0 4px 12px rgb(var(--shadow-rgb) / var(--sh-a1))',
        glow: '0 0 0 1px rgb(var(--primary-500) / 0.3), 0 14px 34px -10px rgb(var(--primary-500) / 0.55)',
        'glow-accent': '0 0 0 1px rgb(var(--accent-500) / 0.3), 0 14px 34px -10px rgb(var(--accent-500) / 0.5)',
      },
      borderRadius: {
        xl2: '1rem', // 16px — within the spec's 14-18px range
        xl3: '1.375rem', // 22px — dialogs and hero panels
        xl4: '1.75rem', // 28px — the login card
      },
      transitionTimingFunction: {
        // Overshoot-free "settle" curve, used for every hover lift and the
        // dialog entrance so motion decelerates instead of stopping dead.
        spring: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: 0, transform: 'translateY(8px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
        pulseRing: {
          '0%': { boxShadow: '0 0 0 0 rgb(var(--accent-500) / 0.35)' },
          '100%': { boxShadow: '0 0 0 14px rgb(var(--accent-500) / 0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-420px 0' },
          '100%': { backgroundPosition: 'calc(100% + 420px) 0' },
        },
        ripple: {
          '0%': { transform: 'scale(0)', opacity: 0.45 },
          '100%': { transform: 'scale(2.5)', opacity: 0 },
        },
        // Slow vertical float for decorative marks (login crest, empty-state
        // art) — a few pixels only, so it never reads as a distraction.
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        // Pans a wide gradient across an element; used for the animated
        // border sheen on the login card and the auth crest.
        gradientPan: {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        scaleIn: {
          '0%': { opacity: 0, transform: 'scale(0.94)' },
          '100%': { opacity: 1, transform: 'scale(1)' },
        },
        spinSlow: {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
      },
      animation: {
        fadeUp: 'fadeUp 0.4s ease-out both',
        pulseRing: 'pulseRing 1.8s ease-out infinite',
        shimmer: 'shimmer 1.6s ease-in-out infinite',
        ripple: 'ripple 0.6s ease-out',
        float: 'float 6s ease-in-out infinite',
        gradientPan: 'gradientPan 8s ease-in-out infinite',
        scaleIn: 'scaleIn 0.3s cubic-bezier(0.22, 1, 0.36, 1) both',
        spinSlow: 'spinSlow 2.4s linear infinite',
        spinReverse: 'spinSlow 1.6s linear infinite reverse',
      },
    },
  },
  plugins: [],
};
