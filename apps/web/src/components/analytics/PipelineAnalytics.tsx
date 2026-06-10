'use client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, BarChart2, RefreshCw, Target, TrendingUp, Zap } from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { StrategistTask } from '@/types'

// ── Stage distribution bar ────────────────────────────────────

const STAGE_COLORS: Record<string, string> = {
  saved: 'bg-gray-400',
  applied: 'bg-blue-500',
  assessment: 'bg-yellow-500',
  interview: 'bg-purple-500',
  final: 'bg-indigo-500',
  offer: 'bg-green-500',
  rejected: 'bg-red-400',
  withdrawn: 'bg-gray-300',
}

function StageBars({ dist }: { dist: Record<string, number> }) {
  const total = Object.values(dist).reduce((a, b) => a + b, 0)
  if (total === 0) return null

  const STAGE_ORDER = ['saved', 'applied', 'assessment', 'interview', 'final', 'offer', 'rejected', 'withdrawn']
  const sorted = STAGE_ORDER.filter((s) => dist[s] > 0)

  return (
    <div className="space-y-2">
      {sorted.map((stage) => {
        const count = dist[stage] ?? 0
        const pct = Math.round((count / total) * 100)
        return (
          <div key={stage} className="flex items-center gap-3">
            <span className="text-[11px] text-[var(--color-muted)] w-20 capitalize">{stage}</span>
            <div className="flex-1 h-2 bg-[var(--color-surface-sunken)] rounded-full overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all', STAGE_COLORS[stage] ?? 'bg-gray-400')}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-[11px] text-[var(--color-faint)] tabular w-8 text-right">{count}</span>
          </div>
        )
      })}
    </div>
  )
}

// ── Skill gap row ─────────────────────────────────────────────

const PRIORITY_COLORS = {
  high: 'text-red-600 bg-red-50 border-red-200',
  medium: 'text-amber-600 bg-amber-50 border-amber-200',
  low: 'text-green-600 bg-green-50 border-green-200',
}

// ── Main component ─────────────────────────────────────────────

export function PipelineAnalytics() {
  const qc = useQueryClient()

  const { data: task, isLoading } = useQuery({
    queryKey: ['strategist-latest'],
    queryFn: () => api.strategist.latest(),
    staleTime: 60_000,
  })

  const { data: applications = [] } = useQuery({
    queryKey: ['applications'],
    queryFn: () => api.applications.list(),
    staleTime: 30_000,
  })

  const runAnalysis = useMutation({
    mutationFn: () => api.strategist.analyze(),
    onSuccess: () => {
      // Poll until done
      let attempts = 0
      const poll = async () => {
        await new Promise((r) => setTimeout(r, 3_000))
        qc.invalidateQueries({ queryKey: ['strategist-latest'] })
        const latest = await api.strategist.latest()
        if (!latest || (latest.status !== 'succeeded')) {
          if (attempts++ < 20) poll()
        }
      }
      poll()
    },
  })

  // Compute local stage distribution while waiting for strategist
  const localStageDist: Record<string, number> = {}
  for (const app of applications) {
    localStageDist[app.stage] = (localStageDist[app.stage] ?? 0) + 1
  }

  const report = (task as StrategistTask | null)?.output?.report ?? null
  const meta = (task as StrategistTask | null)?.output?.meta ?? null
  const stageDist = meta?.stageDist ?? localStageDist

  return (
    <div className="max-w-3xl mx-auto px-6 py-6 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[18px] font-semibold text-[var(--color-text)]">Pipeline Analytics</h1>
          {task?.finished_at && (
            <p className="text-[11px] text-[var(--color-faint)] mt-0.5">
              Last analysis {new Date(task.finished_at).toLocaleString()}
            </p>
          )}
        </div>
        <button
          onClick={() => runAnalysis.mutate()}
          disabled={runAnalysis.isPending}
          className="flex items-center gap-1.5 h-8 px-3 rounded-sm text-[12px] font-medium bg-[var(--color-text)] text-[var(--color-bg)] hover:opacity-80 disabled:opacity-40 transition-opacity"
        >
          <RefreshCw size={12} strokeWidth={1.5} className={runAnalysis.isPending ? 'animate-spin' : ''} />
          {runAnalysis.isPending ? 'Analyzing...' : 'Run Analysis'}
        </button>
      </div>

      {/* Pipeline overview */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <BarChart2 size={14} strokeWidth={1.5} className="text-[var(--color-faint)]" />
          <p className="text-[12px] font-medium uppercase tracking-wider text-[var(--color-faint)]">
            Pipeline ({applications.length} applications)
          </p>
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md px-5 py-4">
          {Object.keys(stageDist).length > 0 ? (
            <StageBars dist={stageDist} />
          ) : (
            <p className="text-[13px] text-[var(--color-faint)]">No applications tracked yet.</p>
          )}
          {report && (
            <div className="mt-4 pt-4 border-t border-[var(--color-border)] space-y-1">
              <p className="text-[13px] text-[var(--color-text)] leading-relaxed">{report.pipeline_health.summary}</p>
              <p className="text-[12px] text-[var(--color-muted)] italic">{report.pipeline_health.velocity_assessment}</p>
            </div>
          )}
        </div>
      </section>

      {/* Skill gaps */}
      {report && report.skill_gaps.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={14} strokeWidth={1.5} className="text-[var(--color-faint)]" />
            <p className="text-[12px] font-medium uppercase tracking-wider text-[var(--color-faint)]">
              Skill Gaps to Close
            </p>
          </div>
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md divide-y divide-[var(--color-border)]">
            {report.skill_gaps.map((gap, i) => (
              <div key={i} className="px-5 py-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[13px] font-medium text-[var(--color-text)]">{gap.skill}</span>
                    <span
                      className={cn(
                        'text-[10px] font-medium px-1.5 py-0.5 rounded border',
                        PRIORITY_COLORS[gap.priority],
                      )}
                    >
                      {gap.priority}
                    </span>
                    <span className="text-[10px] text-[var(--color-faint)]">
                      missing in {gap.frequency} opp{gap.frequency > 1 ? 's' : ''}
                    </span>
                  </div>
                  <p className="text-[12px] text-[var(--color-muted)]">{gap.suggestion}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Targeting advice */}
      {report && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Target size={14} strokeWidth={1.5} className="text-[var(--color-faint)]" />
            <p className="text-[12px] font-medium uppercase tracking-wider text-[var(--color-faint)]">
              Targeting Advice
            </p>
          </div>
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md px-5 py-4 space-y-4">
            <div>
              <p className="text-[11px] font-medium text-green-600 mb-2">Focus on</p>
              <ul className="space-y-1">
                {report.targeting_advice.focus_roles.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-[13px] text-[var(--color-text)]">
                    <span className="text-green-500 mt-0.5">✓</span>
                    {r}
                  </li>
                ))}
              </ul>
            </div>
            {report.targeting_advice.avoid_patterns.length > 0 && (
              <div>
                <p className="text-[11px] font-medium text-amber-600 mb-2">Avoid</p>
                <ul className="space-y-1">
                  {report.targeting_advice.avoid_patterns.map((p, i) => (
                    <li key={i} className="flex items-start gap-2 text-[13px] text-[var(--color-text)]">
                      <span className="text-amber-500 mt-0.5">−</span>
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="border-t border-[var(--color-border)] pt-3">
              <p className="text-[11px] font-medium text-[var(--color-muted)] mb-1">Sweet spot</p>
              <p className="text-[13px] text-[var(--color-text)] leading-relaxed">
                {report.targeting_advice.sweet_spot}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Actionable suggestions */}
      {report && report.actionable_suggestions.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Zap size={14} strokeWidth={1.5} className="text-[var(--color-faint)]" />
            <p className="text-[12px] font-medium uppercase tracking-wider text-[var(--color-faint)]">
              Do This Week
            </p>
          </div>
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md divide-y divide-[var(--color-border)]">
            {report.actionable_suggestions.map((s, i) => (
              <div key={i} className="px-5 py-3 flex items-start gap-3">
                <span className="text-[11px] font-semibold text-[var(--color-faint)] mt-0.5 tabular">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <p className="text-[13px] text-[var(--color-text)] leading-relaxed">{s}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Empty state when no analysis yet */}
      {!report && !isLoading && (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
          <BarChart2 size={32} strokeWidth={1} className="text-[var(--color-faint)]" />
          <p className="text-[14px] text-[var(--color-muted)]">No analysis yet</p>
          <p className="text-[12px] text-[var(--color-faint)] max-w-xs">
            Click "Run Analysis" to get AI-powered skill gap and targeting advice based on your pipeline.
          </p>
        </div>
      )}
    </div>
  )
}
