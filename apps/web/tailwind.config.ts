import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--color-bg)',
        surface: 'var(--color-surface)',
        'surface-sunken': 'var(--color-surface-sunken)',
        border: 'var(--color-border)',
        ink: 'var(--color-text)',
        muted: 'var(--color-muted)',
        faint: 'var(--color-faint)',
        success: '#10B981',
        info: '#3B82F6',
        warn: '#F59E0B',
        danger: '#EF4444',
        'accent-cream': '#E9EDE3',
      },
      borderRadius: {
        DEFAULT: '16px',
        sm: '12px',
        md: '16px',
        lg: '20px',
        pill: '999px',
      },
      fontFamily: {
        sans: ['Inter', 'SF Pro Display', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        caption: ['12px', { fontWeight: '500' }],
        body: ['14px', { fontWeight: '400' }],
        h3: ['20px', { fontWeight: '600' }],
        h2: ['28px', { fontWeight: '600' }],
        h1: ['40px', { fontWeight: '600' }],
        metric: ['48px', { fontWeight: '700' }],
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,.05)',
        panel: '0 4px 20px rgba(0,0,0,.04)',
      },
      transitionTimingFunction: {
        standard: 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      transitionDuration: {
        fast: '150ms',
        base: '200ms',
      },
    },
  },
  plugins: [],
}

export default config
