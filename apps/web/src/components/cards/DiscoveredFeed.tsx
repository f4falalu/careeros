'use client'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, Radar, ChevronRight } from 'lucide-react'
import { api } from '@/lib/api'
import { formatRelative, titleCase } from '@/lib/utils'

export function DiscoveredFeed() {
  const qc = useQueryClient()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['opportunities', { source: 'job_board', limit: 10 }],
    queryFn: () => api.opportunities.list({ source: 'job_board', limit: 10 }),
    staleTime: 60_000,
  })

  const items = data?.items ?? []

  const track = useMutation({
    mutationFn: (opportunityId: string) => api.applications.create(opportunityId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['applications'] })
      qc.invalidateQueries({ queryKey: ['kanban'] })
    },
  })

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md">
      <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-2">
          <Radar size={15} strokeWidth={1.5} className="text-[var(--color-muted)]" />
          <h3 className="text-[15px] font-semibold text-[var(--color-text)]">Discovered</h3>
          {items.length > 0 && (
            <span className="text-[11px] font-medium tabular bg-[var(--color-surface-sunken)] text-[var(--color-muted)] px-1.5 py-0.5 rounded-full">
              {items.length}
            </span>
          )}
        </div>
        <Link
          href="/opportunities"
          className="flex items-center gap-1 text-[12px] text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors"
        >
          All jobs <ChevronRight size={12} />
        </Link>
      </div>

      {isError ? (
        <p className="px-6 py-6 text-[13px] text-danger">Failed to load discovered jobs.</p>
      ) : isLoading ? (
        <div className="p-6 space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-12 rounded bg-[var(--color-surface-sunken)] animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="px-6 py-10 text-center">
          <Radar size={28} strokeWidth={1} className="mx-auto mb-2 text-[var(--color-faint)]" />
          <p className="text-[13px] text-[var(--color-muted)]">No discovered jobs yet.</p>
          <Link
            href="/settings"
            className="text-[12px] text-[var(--color-muted)] underline underline-offset-2 mt-1 inline-block"
          >
            Configure job boards in Settings →
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-[var(--color-border)]">
          {items.map((opp) => (
            <li
              key={opp.id}
              className="flex items-center gap-3 px-6 py-3 hover:bg-[var(--color-bg)] transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-[var(--color-text)] truncate">
                  {opp.role_title}
                </p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  {opp.work_model && opp.work_model !== 'unknown' && (
                    <span className="text-[11px] text-[var(--color-muted)]">
                      {titleCase(opp.work_model)}
                    </span>
                  )}
                  {opp.location && (
                    <span className="text-[11px] text-[var(--color-faint)]">{opp.location}</span>
                  )}
                  {opp.salary_text && (
                    <span className="text-[11px] text-[var(--color-faint)] tabular">{opp.salary_text}</span>
                  )}
                </div>
              </div>
              <span className="text-[11px] text-[var(--color-faint)] tabular shrink-0">
                {formatRelative(opp.created_at)}
              </span>
              {opp.source_url && (
                <a
                  href={opp.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-[var(--color-faint)] hover:text-[var(--color-muted)] transition-colors shrink-0"
                >
                  <ExternalLink size={13} strokeWidth={1.5} />
                </a>
              )}
              <button
                onClick={() => track.mutate(opp.id)}
                disabled={track.isPending && track.variables === opp.id}
                className="shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-pill bg-[var(--color-text)] text-[var(--color-bg)] hover:opacity-80 transition-opacity disabled:opacity-40"
              >
                Track
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
