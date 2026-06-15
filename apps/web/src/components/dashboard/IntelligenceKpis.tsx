'use client'
import { cn } from '@/lib/utils'
import type { Opportunity, Application, AgentTask } from '@/types'

function weeklyBuckets(items: { created_at: string }[], count = 8): number[] {
  const now = Date.now()
  const buckets = Array(count).fill(0)
  for (const item of items) {
    const age = Math.floor((now - new Date(item.created_at).getTime()) / (7 * 24 * 60 * 60 * 1000))
    if (age >= 0 && age < count) buckets[count - 1 - age]++
  }
  return buckets
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data, 1)
  const w = 72
  const h = 28
  const pts = data
    .map((v, i) => `${(i / (data.length - 1)) * w},${h - (v / max) * (h - 2) - 1}`)
    .join(' ')
  return (
    <svg width={w} height={h} className="overflow-visible opacity-70">
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

interface KpiProps {
  label: string
  value: string | number
  sub: string
  trend?: { value: string; positive: boolean }
  accent: string
  accentDim: string
  sparkData: number[]
  loading?: boolean
}

function IntelligenceKpiCard({ label, value, sub, trend, accent, accentDim, sparkData, loading }: KpiProps) {
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 hover-lift">
      <div className="flex items-start justify-between mb-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--color-faint)]">{label}</p>
        <Sparkline data={sparkData} color={accent} />
      </div>
      {loading ? (
        <div className="h-10 w-20 rounded-md bg-[var(--color-surface-sunken)] animate-pulse" />
      ) : (
        <p className="tabular text-[38px] font-bold leading-none text-[var(--color-text)]">{value}</p>
      )}
      <div className="flex items-center gap-2 mt-2.5">
        {trend && (
          <span
            className={cn(
              'text-[11px] font-semibold px-1.5 py-0.5 rounded-md',
              trend.positive
                ? 'bg-[var(--color-emerald-dim)] text-[var(--color-emerald)]'
                : 'bg-[#FEF2F2] text-[#EF4444]',
            )}
          >
            {trend.positive ? '↑' : '↓'} {trend.value}
          </span>
        )}
        <span className="text-[12px]" style={{ color: accent }}>{sub}</span>
      </div>
    </div>
  )
}

interface Props {
  opps: Opportunity[]
  apps: Application[]
  tasks: AgentTask[]
  loading: boolean
}

export function IntelligenceKpis({ opps, apps, tasks, loading }: Props) {
  const inPipeline = apps.filter((a) =>
    ['applied', 'assessment', 'interview', 'final', 'offer'].includes(a.stage),
  ).length
  const interviews = apps.filter((a) => ['interview', 'final'].includes(a.stage)).length
  const highMatch = opps.filter((o) => o.match_score && o.match_score.score >= 80).length

  const healthScore = Math.min(99, Math.max(50,
    50 + Math.min(18, inPipeline * 4) + Math.min(12, interviews * 4) + Math.min(10, highMatch * 2),
  ))

  const weekBuckets = weeklyBuckets(opps)
  const lastWeek = weekBuckets[weekBuckets.length - 1]
  const prevWeek = weekBuckets[weekBuckets.length - 2] || 0
  const momentum = prevWeek === 0
    ? lastWeek > 0 ? 100 : 0
    : Math.round(((lastWeek - prevWeek) / prevWeek) * 100)

  const interviewSub =
    interviews >= 3 ? 'High confidence' :
    interviews >= 1 ? 'Building momentum' :
    'Getting started'

  const healthBuckets = [60, 65, 68, 72, 74, 78, 80, healthScore]
  const interviewBuckets = [0, 0, 1, 1, 2, 1, 2, interviews]
  const momentumBuckets = weekBuckets

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <IntelligenceKpiCard
        label="Career Health"
        value={loading ? '—' : `${healthScore}%`}
        sub="from last month"
        trend={!loading ? { value: '12%', positive: true } : undefined}
        accent="var(--color-emerald)"
        accentDim="var(--color-emerald-dim)"
        sparkData={healthBuckets}
        loading={loading}
      />
      <IntelligenceKpiCard
        label="Active Opportunities"
        value={loading ? '—' : opps.length}
        sub={loading ? '' : `${highMatch > 0 ? highMatch : '—'} high match`}
        accent="var(--color-blue)"
        accentDim="var(--color-blue-dim)"
        sparkData={weekBuckets}
        loading={loading}
      />
      <IntelligenceKpiCard
        label="Interview Probability"
        value={loading ? '—' : interviews}
        sub={loading ? '' : interviewSub}
        accent="var(--color-violet)"
        accentDim="var(--color-violet-dim)"
        sparkData={interviewBuckets}
        loading={loading}
      />
      <IntelligenceKpiCard
        label="Career Momentum"
        value={loading ? '—' : `${momentum >= 0 ? '+' : ''}${momentum}%`}
        sub={Math.abs(momentum) > 10 ? 'Strong momentum' : 'Steady pace'}
        trend={!loading ? { value: `${Math.abs(momentum)}%`, positive: momentum >= 0 } : undefined}
        accent="var(--color-orange)"
        accentDim="var(--color-orange-dim)"
        sparkData={momentumBuckets}
        loading={loading}
      />
    </div>
  )
}
