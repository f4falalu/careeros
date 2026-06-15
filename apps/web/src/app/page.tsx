'use client'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { Calendar, Building2, Bot, Users, ArrowRight } from 'lucide-react'
import { api } from '@/lib/api'
import { IntelligenceKpis } from '@/components/dashboard/IntelligenceKpis'
import { RecommendedOpportunities } from '@/components/dashboard/RecommendedOpportunities'
import { CareerIntelligence } from '@/components/dashboard/CareerIntelligence'
import { CareerIntelligenceWidget } from '@/components/dashboard/CareerIntelligenceWidget'
import { TodaysFocus } from '@/components/dashboard/TodaysFocus'
import { AwaitingApproval } from '@/components/dashboard/AwaitingApproval'
import { DashboardCopilot } from '@/components/dashboard/DashboardCopilot'

function BottomStatCard({
  href,
  icon: Icon,
  label,
  count,
  countLabel,
  iconColor,
}: {
  href: string
  icon: React.ElementType
  label: string
  count: number | string
  countLabel: string
  iconColor: string
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-4 py-3.5 hover:border-[var(--color-border-strong)] hover:shadow-card transition-all duration-150 group"
    >
      <div
        className="w-8 h-8 rounded-md flex items-center justify-center shrink-0"
        style={{ background: `color-mix(in srgb, ${iconColor} 12%, transparent)` }}
      >
        <Icon size={14} style={{ color: iconColor }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-[var(--color-text)]">{label}</p>
        <p className="text-[11.5px] text-[var(--color-muted)]">
          <span className="font-semibold tabular">{count}</span> {countLabel}
        </p>
      </div>
      <ArrowRight size={13} className="text-[var(--color-faint)] group-hover:text-[var(--color-muted)] transition-colors shrink-0" />
    </Link>
  )
}

export default function DashboardPage() {
  const { data: oppPage, isLoading: oppsLoading, isError: oppsError } = useQuery({
    queryKey: ['opportunities', { limit: 200 }],
    queryFn: () => api.opportunities.list({ limit: 200 }),
  })

  const { data: apps = [], isLoading: appsLoading, isError: appsError } = useQuery({
    queryKey: ['applications'],
    queryFn: () => api.applications.list(),
  })

  const { data: allTasks = [], isLoading: tasksLoading, isError: tasksError } = useQuery({
    queryKey: ['tasks', 'active'],
    queryFn: () => api.tasks.list({ limit: 100 }),
    refetchInterval: 8_000,
  })

  const { data: interviews = [] } = useQuery({
    queryKey: ['interviews'],
    queryFn: () => api.interviews.list(),
  })

  const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: () => api.companies.list(),
  })

  const opps = oppPage?.items ?? []
  const loading = oppsLoading || appsLoading || tasksLoading

  const activeAgentTasks = allTasks.filter((t) => t.status === 'running' || t.status === 'queued').length
  const pendingApprovals = allTasks.filter((t) => t.status === 'needs_approval').length
  const upcomingInterviews = interviews.filter((i) => i.scheduled_at && new Date(i.scheduled_at) > new Date()).length

  return (
    <div className="flex gap-6 animate-fade-in">
      {/* ── Left: main scrollable content ── */}
      <div className="flex-1 min-w-0 space-y-6">
        {(oppsError || appsError || tasksError) && (
          <div className="px-4 py-3 rounded-md bg-[#FEF2F2] text-[#EF4444] text-[12.5px] border border-[#FEE2E2]">
            Some data failed to load — make sure the API is running at{' '}
            <code className="font-mono">{process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'}</code>.
          </div>
        )}

        {/* KPI intelligence row */}
        <IntelligenceKpis opps={opps} apps={apps} tasks={allTasks} loading={loading} />

        {/* Recommended opportunities */}
        <RecommendedOpportunities />

        {/* Career intelligence + graph side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
          <CareerIntelligence />
          <CareerIntelligenceWidget />
        </div>

        {/* Bottom stat links */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          <BottomStatCard
            href="/interviews"
            icon={Calendar}
            label="Upcoming Interviews"
            count={upcomingInterviews || '—'}
            countLabel="this week"
            iconColor="var(--color-violet)"
          />
          <BottomStatCard
            href="/companies"
            icon={Building2}
            label="Company Research"
            count={companies.filter((c) => c.has_brief).length || '—'}
            countLabel="in progress"
            iconColor="var(--color-blue)"
          />
          <BottomStatCard
            href="/agents"
            icon={Bot}
            label="Agent Tasks"
            count={activeAgentTasks || pendingApprovals || '—'}
            countLabel={pendingApprovals > 0 ? `${pendingApprovals} need review` : 'running'}
            iconColor="var(--color-orange)"
          />
          <BottomStatCard
            href="/outreach"
            icon={Users}
            label="Network Updates"
            count="—"
            countLabel="new updates"
            iconColor="var(--color-emerald)"
          />
        </div>
      </div>

      {/* ── Right: sticky panel ── */}
      <aside className="w-[300px] shrink-0">
        <div className="sticky top-8 space-y-4">
          <TodaysFocus />
          <AwaitingApproval />
          <DashboardCopilot />
        </div>
      </aside>
    </div>
  )
}
