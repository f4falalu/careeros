import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--color-bg)',
        surface: 'var(--color-surface)',
        'surface-sunken': 'var(--color-surface-sunken)',
        'surface-elevated': 'var(--color-surface-elevated)',
        border: 'var(--color-border)',
        'border-strong': 'var(--color-border-strong)',
        ink: 'var(--color-text)',
        muted: 'var(--color-muted)',
        faint: 'var(--color-faint)',
        success: '#10B981',
        info: '#3B82F6',
        warn: '#F59E0B',
        danger: '#EF4444',
        brand: 'var(--color-brand)',
        // Named accents (access via arbitrary values or these tokens)
        'c-emerald': 'var(--color-emerald)',
        'c-emerald-dim': 'var(--color-emerald-dim)',
        'c-amber': 'var(--color-amber)',
        'c-amber-dim': 'var(--color-amber-dim)',
        'c-blue': 'var(--color-blue)',
        'c-blue-dim': 'var(--color-blue-dim)',
        'c-violet': 'var(--color-violet)',
        'c-violet-dim': 'var(--color-violet-dim)',
        'c-orange': 'var(--color-orange)',
        'c-orange-dim': 'var(--color-orange-dim)',
      },
      borderRadius: {
        DEFAULT: '10px',
        sm: '6px',
        md: '10px',
        lg: '14px',
        xl: '18px',
        pill: '9999px',
      },
      fontFamily: {
        sans: ['Outfit', 'SF Pro Display', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        caption: ['11px', { fontWeight: '500', letterSpacing: '0.04em' }],
        body: ['14px', { fontWeight: '400' }],
        h3: ['17px', { fontWeight: '600' }],
        h2: ['24px', { fontWeight: '600' }],
        h1: ['34px', { fontWeight: '700' }],
        metric: ['42px', { fontWeight: '700' }],
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        panel: '0 4px 24px rgba(0,0,0,0.06)',
        'card-hover': '0 8px 32px rgba(0,0,0,0.10)',
        float: '0 16px 40px rgba(0,0,0,0.12)',
      },
      animation: {
        'spin-slow': 'spin 3s linear infinite',
        'pulse-soft': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 200ms ease-out',
        'slide-up': 'slideUp 250ms ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}

export default config
