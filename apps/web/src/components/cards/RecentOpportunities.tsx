'use client'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { ExternalLink, ArrowRight } from 'lucide-react'
import { api } from '@/lib/api'
import { formatRelative, titleCase } from '@/lib/utils'

export function RecentOpportunities() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['opportunities', { limit: 8 }],
    queryFn: () => api.opportunities.list({ limit: 8 }),
  })

  const items = data?.items ?? []

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md">
      <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
        <h3 className="text-[15px] font-semibold text-[var(--color-text)]">Recent Jobs</h3>
        <Link
          href="/opportunities"
          className="flex items-center gap-1 text-[12px] text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors"
        >
          View all <ArrowRight size={12} />
        </Link>
      </div>

      {isError ? (
        <p className="px-6 py-6 text-[13px] text-danger">Failed to load jobs — API may be down.</p>
      ) : isLoading ? (
        <div className="p-6 space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-10 rounded bg-[var(--color-surface-sunken)] animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="px-6 py-8 text-center text-[13px] text-[var(--color-muted)]">
          No jobs yet. Paste a job URL above to start.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--color-border)]">
          {items.map((opp) => (
            <li key={opp.id} className="flex items-center gap-4 px-6 py-3 hover:bg-[var(--color-bg)] transition-colors">
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-[var(--color-text)] truncate">
                  {opp.role_title}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  {opp.work_model && opp.work_model !== 'unknown' && (
                    <span className="text-[11px] text-[var(--color-muted)]">
                      {titleCase(opp.work_model)}
                    </span>
                  )}
                  {opp.location && (
                    <span className="text-[11px] text-[var(--color-faint)]">{opp.location}</span>
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
                  className="text-[var(--color-faint)] hover:text-[var(--color-muted)] transition-colors shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink size={13} strokeWidth={1.5} />
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
