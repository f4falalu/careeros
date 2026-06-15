'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { ArrowRight, Check, Users } from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { Opportunity } from '@/types'

function matchBadgeClass(score: number) {
  if (score >= 85) return 'bg-[var(--color-emerald-dim)] text-[var(--color-emerald-text)]'
  if (score >= 70) return 'bg-[var(--color-blue-dim)] text-[var(--color-blue-text)]'
  return 'bg-[var(--color-amber-dim)] text-[var(--color-amber-text)]'
}

function CompanyAvatar({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
  const colors = [
    'bg-[#F0FDF4] text-[#166534]',
    'bg-[#EFF6FF] text-[#1E40AF]',
    'bg-[#FDF4FF] text-[#7E22CE]',
    'bg-[#FFF7ED] text-[#9A3412]',
    'bg-[#F0F9FF] text-[#075985]',
  ]
  const idx = name.charCodeAt(0) % colors.length
  return (
    <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center text-[13px] font-bold shrink-0', colors[idx])}>
      {initials}
    </div>
  )
}

function MatchReasons({ opp }: { opp: Opportunity }) {
  const reasons: string[] = []
  if (opp.match_score?.rationale) {
    const sentences = opp.match_score.rationale.split(/[.,;]/).filter(Boolean)
    reasons.push(...sentences.slice(0, 3).map((s) => s.trim()))
  } else if (opp.required_skills.length > 0) {
    reasons.push(...opp.required_skills.slice(0, 3))
  }
  if (reasons.length === 0) return null
  return (
    <ul className="mt-3 space-y-1">
      {reasons.slice(0, 3).map((r, i) => (
        <li key={i} className="flex items-start gap-1.5 text-[12px] text-[var(--color-muted)]">
          <Check size={11} className="text-[var(--color-emerald)] shrink-0 mt-0.5" />
          <span className="leading-snug">{r}</span>
        </li>
      ))}
    </ul>
  )
}

function OpportunityCard({ opp }: { opp: Opportunity }) {
  const qc = useQueryClient()
  const track = useMutation({
    mutationFn: () => api.applications.create(opp.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['applications'] }),
  })
  const score = opp.match_score?.score

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 hover:border-[var(--color-border-strong)] hover:shadow-card transition-all duration-150 flex flex-col min-w-0">
      {/* Company + score */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <CompanyAvatar name={opp.company_name ?? opp.role_title} />
        {score !== undefined && score !== null && (
          <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-pill shrink-0', matchBadgeClass(score))}>
            {Math.round(score)}% Match
          </span>
        )}
      </div>

      {/* Role info */}
      <p className="text-[13.5px] font-semibold text-[var(--color-text)] leading-snug">
        {opp.role_title}
      </p>
      {opp.company_name && (
        <p className="text-[12px] text-[var(--color-muted)] mt-0.5">{opp.company_name}</p>
      )}

      {score !== undefined && <MatchReasons opp={opp} />}

      {/* Footer */}
      <div className="mt-auto pt-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 text-[11px] text-[var(--color-faint)]">
          <Users size={11} />
          <span>{Math.floor(Math.random() * 10) + 2} connections</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Link
            href={`/jobs/${opp.id}`}
            className="h-7 px-2.5 rounded-md border border-[var(--color-border)] text-[12px] font-medium text-[var(--color-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-border-strong)] transition-colors flex items-center"
          >
            View
          </Link>
          <button
            onClick={() => track.mutate()}
            disabled={track.isPending}
            className="h-7 px-2.5 rounded-md bg-[var(--color-text)] text-[var(--color-surface)] text-[12px] font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center"
          >
            {track.isPending ? 'Adding…' : 'Track'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function RecommendedOpportunities() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['opportunities', { with_match: true, limit: 6 }],
    queryFn: () => api.opportunities.list({ with_match: true, limit: 6 }),
    staleTime: 60_000,
  })

  const sorted = (data?.items ?? [])
    .filter((o) => o.match_score)
    .sort((a, b) => (b.match_score?.score ?? 0) - (a.match_score?.score ?? 0))
    .slice(0, 3)

  const fallback = (data?.items ?? []).slice(0, 3)
  const items = sorted.length > 0 ? sorted : fallback

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-[15px] font-semibold text-[var(--color-text)]">Recommended Opportunities</h2>
          <p className="text-[12px] text-[var(--color-muted)] mt-0.5">Top matches based on your profile, goals, and career graph</p>
        </div>
        <Link
          href="/jobs"
          className="flex items-center gap-1 text-[12px] text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors"
        >
          View all <ArrowRight size={12} />
        </Link>
      </div>

      {isError ? (
        <p className="text-[13px] text-danger py-4">Failed to load opportunities.</p>
      ) : isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-48 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-6 py-10 text-center">
          <p className="text-[13px] text-[var(--color-muted)]">No opportunities yet. Paste a job URL to start.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {items.map((opp) => <OpportunityCard key={opp.id} opp={opp} />)}
        </div>
      )}
    </div>
  )
}
