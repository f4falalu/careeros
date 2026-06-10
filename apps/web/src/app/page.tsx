'use client'
import { useQuery } from '@tanstack/react-query'
import { KpiCard } from '@/components/cards/KpiCard'
import { AgentTaskFeed } from '@/components/cards/AgentTaskFeed'
import { RecentOpportunities } from '@/components/cards/RecentOpportunities'
import { DiscoveredFeed } from '@/components/cards/DiscoveredFeed'
import { api } from '@/lib/api'

export default function DashboardPage() {
  const { data: oppPage, isLoading: oppsLoading, isError: oppsError } = useQuery({
    queryKey: ['opportunities', { limit: 200 }],
    queryFn: () => api.opportunities.list({ limit: 200 }),
  })

  const { data: apps = [], isLoading: appsLoading, isError: appsError } = useQuery({
    queryKey: ['applications'],
    queryFn: () => api.applications.list(),
  })

  const { data: activeTasks = [], isLoading: tasksLoading, isError: tasksError } = useQuery({
    queryKey: ['tasks', 'active'],
    queryFn: () => api.tasks.list({ limit: 100 }),
    refetchInterval: 8_000,
  })

  const opps = oppPage?.items ?? []
  const inPipeline = apps.filter((a) =>
    ['applied', 'assessment', 'interview', 'final', 'offer'].includes(a.stage),
  ).length
  const interviews = apps.filter((a) =>
    ['interview', 'final'].includes(a.stage),
  ).length
  const running = activeTasks.filter((t) =>
    t.status === 'running' || t.status === 'queued',
  ).length

  const loading = oppsLoading || appsLoading || tasksLoading

  return (
    <div className="space-y-8 max-w-[1440px]">
      {(oppsError || appsError || tasksError) && (
        <div className="px-4 py-3 rounded-md bg-danger/10 text-danger text-[12px]">
          Some data failed to load — make sure the API is running at {process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'}.
        </div>
      )}
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Total Jobs"
          value={loading ? '—' : opps.length}
          sub="saved in CareerOS"
          loading={loading}
        />
        <KpiCard
          label="In Pipeline"
          value={loading ? '—' : inPipeline}
          sub="actively tracking"
          loading={loading}
          highlight
        />
        <KpiCard
          label="Interviews"
          value={loading ? '—' : interviews}
          sub="interview or final round"
          loading={loading}
        />
        <KpiCard
          label="Active Agents"
          value={loading ? '—' : running}
          sub="queued or running"
          loading={loading}
        />
      </div>

      {/* Main 2-col grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
        <div className="space-y-6">
          <RecentOpportunities />
          <DiscoveredFeed />
        </div>
        <AgentTaskFeed />
      </div>
    </div>
  )
}
