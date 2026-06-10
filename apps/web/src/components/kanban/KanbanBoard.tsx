'use client'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { OpportunityCard } from './OpportunityCard'
import { titleCase } from '@/lib/utils'
import type { Opportunity, Application, PipelineStage } from '@/types'

const ACTIVE_STAGES: PipelineStage[] = [
  'saved', 'applied', 'assessment', 'interview', 'final', 'offer',
]

export function KanbanBoard() {
  const { data: oppPage, isLoading: oppsLoading, isError: oppsError } = useQuery({
    queryKey: ['opportunities', { limit: 200 }],
    queryFn: () => api.opportunities.list({ limit: 200 }),
    staleTime: 30_000,
  })

  const { data: apps = [], isLoading: appsLoading, isError: appsError } = useQuery({
    queryKey: ['applications'],
    queryFn: () => api.applications.list(),
    staleTime: 30_000,
  })

  const opps = oppPage?.items ?? []
  const isLoading = oppsLoading || appsLoading

  // Map opportunity_id → application for quick lookup
  const appByOpp = new Map<string, Application>(apps.map((a) => [a.opportunity_id, a]))

  // Group opportunities by pipeline stage (fallback to 'saved' if untracked)
  const columns: Record<PipelineStage, Opportunity[]> = {
    saved: [], applied: [], assessment: [], interview: [],
    final: [], offer: [], rejected: [], withdrawn: [],
  }

  for (const opp of opps) {
    const app = appByOpp.get(opp.id)
    const stage: PipelineStage = app?.stage ?? 'saved'
    columns[stage].push(opp)
  }

  if (oppsError || appsError) {
    return (
      <div className="p-6 rounded-md bg-danger/10 text-danger text-[13px]">
        Failed to load board — check that the API is running at {process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'}.
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-4">
        {ACTIVE_STAGES.map((s) => (
          <div key={s} className="shrink-0 w-[260px]">
            <div className="h-7 w-24 rounded bg-[var(--color-surface-sunken)] animate-pulse mb-3" />
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-28 rounded-md bg-[var(--color-surface)] border border-[var(--color-border)] animate-pulse" />
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-6 min-h-[calc(100vh-220px)]">
      {ACTIVE_STAGES.map((stage) => {
        const cards = columns[stage]
        return (
          <div key={stage} className="shrink-0 w-[260px] flex flex-col">
            {/* Column header */}
            <div className="flex items-center gap-2 mb-3 px-1">
              <h3 className="text-[12px] font-semibold uppercase tracking-widest text-[var(--color-muted)]">
                {titleCase(stage)}
              </h3>
              <span className="text-[11px] font-medium text-[var(--color-faint)] tabular">
                {cards.length}
              </span>
            </div>

            {/* Cards */}
            <div className="flex-1 space-y-3">
              {cards.map((opp) => (
                <OpportunityCard
                  key={opp.id}
                  opportunity={opp}
                  application={appByOpp.get(opp.id)}
                />
              ))}
              {cards.length === 0 && (
                <div className="rounded-md border border-dashed border-[var(--color-border)] p-4 text-center text-[11px] text-[var(--color-faint)]">
                  Empty
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
