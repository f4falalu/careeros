import { cn } from '@/lib/utils'

interface KpiCardProps {
  label: string
  value: string | number
  sub?: string
  trend?: number
  highlight?: boolean
  loading?: boolean
}

export function KpiCard({ label, value, sub, trend, highlight, loading }: KpiCardProps) {
  return (
    <div
      className={cn(
        'rounded-md p-6 border hover-lift',
        highlight
          ? 'bg-[#E9EDE3] border-transparent'
          : 'bg-[var(--color-surface)] border-[var(--color-border)]',
      )}
    >
      <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--color-muted)] mb-3">
        {label}
      </p>
      {loading ? (
        <div className="h-12 w-20 rounded bg-[var(--color-surface-sunken)] animate-pulse" />
      ) : (
        <p className="tabular text-[48px] font-bold leading-none text-[var(--color-text)]">
          {value}
        </p>
      )}
      {(sub || trend !== undefined) && (
        <div className="flex items-center gap-2 mt-3">
          {trend !== undefined && (
            <span
              className={cn(
                'text-[12px] font-medium',
                trend >= 0 ? 'text-success' : 'text-danger',
              )}
            >
              {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}%
            </span>
          )}
          {sub && <span className="text-[12px] text-[var(--color-muted)]">{sub}</span>}
        </div>
      )}
    </div>
  )
}
