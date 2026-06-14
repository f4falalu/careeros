'use client'
import { use, useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import {
  ArrowLeft,
  ArrowRight,
  MapPin,
  DollarSign,
  Clock,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  FileText,
  Wand2,
  Layers,
  Mail,
  Send,
  Building2,
  Zap,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Users,
} from 'lucide-react'
import { api } from '@/lib/api'
import { cn, titleCase, formatRelative } from '@/lib/utils'
import type { OpportunityDetail } from '@/types'

// ── Feed context ──────────────────────────────────────────────

const JOBS_FEED_KEY = 'careeros_jobs_feed'

interface FeedContext {
  ids: string[]
  index: number
}

function loadFeedContext(): FeedContext | null {
  try {
    const raw = sessionStorage.getItem(JOBS_FEED_KEY)
    if (!raw) return null
    return JSON.parse(raw) as FeedContext
  } catch {
    return null
  }
}

function saveFeedContext(ctx: FeedContext) {
  sessionStorage.setItem(JOBS_FEED_KEY, JSON.stringify(ctx))
}

// ── Helpers ───────────────────────────────────────────────────

function WorkModelPill({ model }: { model?: string }) {
  if (!model || model === 'unknown') return null
  const color =
    model === 'remote' ? 'bg-sky-50 text-sky-700 border-sky-200' :
    model === 'hybrid' ? 'bg-violet-50 text-violet-700 border-violet-200' :
                         'bg-[var(--color-surface-sunken)] text-[var(--color-muted)] border-[var(--color-border)]'
  return (
    <span className={cn('text-[11px] px-2.5 py-1 rounded-full border font-medium', color)}>
      {titleCase(model)}
    </span>
  )
}

// ── Match score hero ──────────────────────────────────────────

function MatchHero({ detail }: { detail: OpportunityDetail }) {
  const qc = useQueryClient()
  const runMatch = useMutation({
    mutationFn: () => api.opportunities.match(detail.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
      setTimeout(() => qc.invalidateQueries({ queryKey: ['job-detail', detail.id] }), 5000)
    },
  })

  if (!detail.match) {
    return (
      <div className="flex items-center justify-between bg-[var(--color-surface-sunken)] border border-[var(--color-border)] rounded-md px-5 py-4">
        <div>
          <p className="text-[13px] font-medium text-[var(--color-text)]">Match score not computed</p>
          <p className="text-[12px] text-[var(--color-muted)] mt-0.5">
            Run the match agent to see how well your profile fits this role
          </p>
        </div>
        <button
          onClick={() => runMatch.mutate()}
          disabled={runMatch.isPending}
          className="shrink-0 flex items-center gap-1.5 h-8 px-4 rounded-sm text-[12px] font-medium bg-[var(--color-text)] text-[var(--color-bg)] hover:opacity-80 disabled:opacity-40"
        >
          <Zap size={12} strokeWidth={1.5} />
          {runMatch.isPending ? 'Queued…' : 'Compute Match'}
        </button>
      </div>
    )
  }

  const score = Math.round(Number(detail.match.score))
  const required = detail.required_skills ?? []
  const missing = detail.match.missing_skills ?? []
  const matched = required.filter((s) => !missing.includes(s))

  const ringColor = score >= 85 ? '#10B981' : score >= 70 ? '#F59E0B' : '#9CA3AF'
  const bgColor   = score >= 85 ? 'bg-emerald-50 border-emerald-200' :
                    score >= 70 ? 'bg-amber-50 border-amber-200' :
                                  'bg-[var(--color-surface-sunken)] border-[var(--color-border)]'

  return (
    <div className={cn('border rounded-md p-5', bgColor)}>
      <div className="flex items-start gap-6">
        {/* Score ring */}
        <div className="shrink-0 flex flex-col items-center justify-center w-20 h-20 rounded-full border-4 relative" style={{ borderColor: ringColor }}>
          <span className="text-[22px] font-bold tabular leading-none" style={{ color: ringColor }}>
            {score}
          </span>
          <span className="text-[10px] font-medium" style={{ color: ringColor }}>%</span>
        </div>

        {/* Breakdown */}
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-[var(--color-text)] mb-0.5">
            {score >= 85 ? 'Strong match' : score >= 70 ? 'Good match' : 'Partial match'}
          </p>
          {detail.match.rationale && (
            <p className="text-[12px] text-[var(--color-muted)] mb-3 leading-relaxed">
              {detail.match.rationale}
            </p>
          )}

          <div className="flex flex-wrap gap-3">
            {matched.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wide mb-1.5">
                  Why this matches
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {matched.map((s) => (
                    <span key={s} className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 border border-emerald-200">
                      <CheckCircle2 size={9} strokeWidth={2} />
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {missing.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-wide mb-1.5">
                  Skill gaps
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {missing.map((s) => (
                    <span key={s} className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200">
                      <AlertCircle size={9} strokeWidth={2} />
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Action bar ────────────────────────────────────────────────

function ActionBar({ detail }: { detail: OpportunityDetail }) {
  const qc = useQueryClient()

  const track = useMutation({
    mutationFn: () => api.applications.create(detail.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['job-detail', detail.id] })
      qc.invalidateQueries({ queryKey: ['applications'] })
    },
  })

  const genResume  = useMutation({ mutationFn: () => api.opportunities.resume(detail.id) })
  const genCover   = useMutation({ mutationFn: () => api.opportunities.coverLetter(detail.id) })
  const proposeVvp = useMutation({ mutationFn: () => api.vvp.propose(detail.id) })
  const draftMsg   = useMutation({ mutationFn: () => api.outreach.draft(detail.id) })
  const autoApply  = useMutation({ mutationFn: () => api.opportunities.apply(detail.id) })

  const btn = (
    label: string,
    Icon: React.ElementType,
    onClick: () => void,
    pending: boolean,
    variant: 'default' | 'primary' | 'danger' = 'default',
  ) => (
    <button
      key={label}
      onClick={onClick}
      disabled={pending}
      className={cn(
        'flex items-center gap-1.5 h-8 px-3.5 rounded-sm text-[12px] font-medium transition-colors disabled:opacity-40',
        variant === 'primary'
          ? 'bg-[var(--color-text)] text-[var(--color-bg)] hover:opacity-80'
          : variant === 'danger'
          ? 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100'
          : 'bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg)]',
      )}
    >
      <Icon size={12} strokeWidth={1.5} />
      {pending ? '…' : label}
    </button>
  )

  return (
    <div className="flex items-center gap-2 flex-wrap bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md px-4 py-3">
      {!detail.application && btn('Track', BookOpen, () => track.mutate(), track.isPending, 'primary')}
      {detail.application && (
        <span className="text-[11px] font-medium px-2.5 py-1 rounded-pill bg-[var(--color-surface-sunken)] text-[var(--color-muted)]">
          Tracked · {titleCase(detail.application.stage)}
        </span>
      )}
      {btn('Tailor Resume', FileText, () => genResume.mutate(), genResume.isPending)}
      {btn('Cover Letter', Wand2, () => genCover.mutate(), genCover.isPending)}
      {btn('VVP', Layers, () => proposeVvp.mutate(), proposeVvp.isPending)}
      {btn('Outreach', Mail, () => draftMsg.mutate(), draftMsg.isPending)}
      {detail.company?.id && btn('Research Co.', Building2, () => {}, false)}
      {btn('Auto-Apply', Send, () => autoApply.mutate(), autoApply.isPending, 'danger')}
      {detail.source_url && (
        <a
          href={detail.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 h-8 px-3.5 rounded-sm text-[12px] font-medium bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg)] ml-auto"
        >
          <ExternalLink size={12} strokeWidth={1.5} />
          Apply
        </a>
      )}
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────

export default function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  const [feed, setFeed] = useState<FeedContext | null>(null)

  useEffect(() => {
    const ctx = loadFeedContext()
    if (ctx) {
      // Sync index to current id in case user navigated directly
      const idx = ctx.ids.indexOf(id)
      const synced = idx >= 0 ? { ...ctx, index: idx } : ctx
      setFeed(synced)
    }
  }, [id])

  const prevId = feed && feed.index > 0 ? feed.ids[feed.index - 1] : null
  const nextId = feed && feed.index < feed.ids.length - 1 ? feed.ids[feed.index + 1] : null
  const position = feed ? feed.index + 1 : null
  const total    = feed ? feed.ids.length : null

  const navigate = useCallback((targetId: string, direction: 'prev' | 'next') => {
    if (!feed) return
    const newIndex = direction === 'prev' ? feed.index - 1 : feed.index + 1
    const updated = { ...feed, index: newIndex }
    saveFeedContext(updated)
    setFeed(updated)
    router.push(`/jobs/${targetId}`)
  }, [feed, router])

  const { data: detail, isLoading } = useQuery({
    queryKey: ['job-detail', id],
    queryFn: () => api.opportunities.get(id),
    staleTime: 30_000,
  })

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-4 animate-pulse">
        <div className="h-8 w-48 bg-[var(--color-surface-sunken)] rounded" />
        <div className="h-44 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md" />
        <div className="h-32 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md" />
        <div className="h-64 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md" />
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="max-w-4xl mx-auto">
        <p className="text-[13px] text-[var(--color-muted)]">Job not found.</p>
        <Link href="/jobs" className="text-[12px] text-[var(--color-muted)] underline mt-2 block">
          ← Back to Jobs
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* Navigation bar */}
      <div className="flex items-center justify-between">
        <Link
          href="/jobs"
          className="flex items-center gap-1.5 text-[12px] text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors"
        >
          <ArrowLeft size={13} strokeWidth={1.5} />
          Jobs
        </Link>

        {feed && total && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => prevId && navigate(prevId, 'prev')}
              disabled={!prevId}
              className="flex items-center gap-1 h-7 px-2.5 rounded-sm text-[12px] font-medium text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg)] border border-[var(--color-border)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={13} strokeWidth={1.5} />
              Prev
            </button>
            <span className="text-[11px] text-[var(--color-faint)] px-2 tabular">
              {position} / {total}
            </span>
            <button
              onClick={() => nextId && navigate(nextId, 'next')}
              disabled={!nextId}
              className="flex items-center gap-1 h-7 px-2.5 rounded-sm text-[12px] font-medium text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg)] border border-[var(--color-border)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Next
              <ChevronRight size={13} strokeWidth={1.5} />
            </button>
          </div>
        )}
      </div>

      {/* Hero card */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md p-6">
        <div className="flex items-start gap-5">
          {/* Company avatar */}
          <div className="shrink-0 w-14 h-14 rounded-md bg-[var(--color-surface-sunken)] border border-[var(--color-border)] flex items-center justify-center text-[18px] font-bold text-[var(--color-muted)] select-none">
            {(detail.company?.name ?? detail.role_title).charAt(0).toUpperCase()}
          </div>

          <div className="flex-1 min-w-0">
            <h1 className="text-[22px] font-semibold text-[var(--color-text)] leading-tight mb-1">
              {detail.role_title}
            </h1>
            <p className="text-[14px] text-[var(--color-muted)] mb-3">
              {detail.company?.name ?? 'Unknown Company'}
              {detail.company?.industry && (
                <span className="text-[var(--color-faint)]"> · {detail.company.industry}</span>
              )}
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <WorkModelPill model={detail.work_model} />
              {detail.location && (
                <span className="flex items-center gap-1 text-[12px] text-[var(--color-muted)]">
                  <MapPin size={11} strokeWidth={1.5} />
                  {detail.location}
                </span>
              )}
              {detail.salary_text && (
                <span className="flex items-center gap-1 text-[12px] text-[var(--color-muted)]">
                  <DollarSign size={11} strokeWidth={1.5} />
                  {detail.salary_text}
                </span>
              )}
              {detail.seniority && (
                <span className="flex items-center gap-1 text-[12px] text-[var(--color-muted)]">
                  <Users size={11} strokeWidth={1.5} />
                  {detail.seniority}
                </span>
              )}
              <span className="flex items-center gap-1 text-[12px] text-[var(--color-faint)]">
                <Clock size={11} strokeWidth={1.5} />
                {formatRelative(detail.created_at)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Match score panel */}
      <MatchHero detail={detail} />

      {/* Action bar */}
      <ActionBar detail={detail} />

      {/* Two column layout */}
      <div className="grid grid-cols-[1fr_300px] gap-4">
        {/* Job description */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-border)]">
            <FileText size={13} strokeWidth={1.5} className="text-[var(--color-muted)]" />
            <h3 className="text-[12px] font-semibold text-[var(--color-text)] uppercase tracking-wide">
              Job Details
            </h3>
          </div>
          <div className="p-5">
            {detail.description ? (
              <p className="text-[13px] text-[var(--color-muted)] leading-relaxed whitespace-pre-line">
                {detail.description}
              </p>
            ) : (
              <p className="text-[13px] text-[var(--color-faint)] italic">
                No description available.{' '}
                {detail.source_url && (
                  <a href={detail.source_url} target="_blank" rel="noopener noreferrer" className="underline">
                    View on original board →
                  </a>
                )}
              </p>
            )}
          </div>
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          {/* Required skills */}
          {(detail.required_skills?.length ?? 0) > 0 && (
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md p-4">
              <p className="text-[11px] font-semibold text-[var(--color-muted)] uppercase tracking-wide mb-3">
                Required Skills
              </p>
              <div className="flex flex-wrap gap-1.5">
                {detail.required_skills!.map((s) => {
                  const isMissing = detail.match?.missing_skills?.includes(s)
                  const isMatched = detail.match && !isMissing
                  return (
                    <span
                      key={s}
                      className={cn(
                        'text-[11px] px-2 py-0.5 rounded border',
                        isMissing
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : isMatched
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-[var(--color-surface-sunken)] text-[var(--color-faint)] border-[var(--color-border)]',
                      )}
                    >
                      {s}
                    </span>
                  )
                })}
              </div>
            </div>
          )}

          {/* More from feed */}
          {feed && total && total > 1 && (
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md p-4">
              <p className="text-[11px] font-semibold text-[var(--color-muted)] uppercase tracking-wide mb-3">
                Discovery Flow
              </p>
              <div className="space-y-2">
                {nextId && (
                  <button
                    onClick={() => navigate(nextId, 'next')}
                    className="w-full flex items-center justify-between gap-2 p-2 rounded-sm hover:bg-[var(--color-bg)] text-left transition-colors"
                  >
                    <span className="text-[12px] text-[var(--color-muted)]">
                      Next match ({position! + 1} of {total})
                    </span>
                    <ArrowRight size={13} strokeWidth={1.5} className="text-[var(--color-faint)] shrink-0" />
                  </button>
                )}
                {prevId && (
                  <button
                    onClick={() => navigate(prevId, 'prev')}
                    className="w-full flex items-center justify-between gap-2 p-2 rounded-sm hover:bg-[var(--color-bg)] text-left transition-colors"
                  >
                    <ArrowLeft size={13} strokeWidth={1.5} className="text-[var(--color-faint)] shrink-0" />
                    <span className="text-[12px] text-[var(--color-muted)]">
                      Prev match ({position! - 1} of {total})
                    </span>
                  </button>
                )}
                <Link
                  href="/jobs"
                  className="flex items-center gap-1.5 text-[12px] text-[var(--color-faint)] hover:text-[var(--color-muted)] transition-colors pt-1"
                >
                  ← Back to all {total} matches
                </Link>
              </div>
            </div>
          )}

          {/* Pipeline status */}
          {detail.application && (
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md p-4">
              <p className="text-[11px] font-semibold text-[var(--color-muted)] uppercase tracking-wide mb-2">
                Pipeline Status
              </p>
              <div className="flex items-center justify-between">
                <span className={cn('stage-' + detail.application.stage, 'text-[12px] font-medium px-2.5 py-1 rounded-pill')}>
                  {titleCase(detail.application.stage)}
                </span>
                <Link
                  href={`/opportunities/${id}`}
                  className="text-[11px] text-[var(--color-muted)] hover:text-[var(--color-text)] underline underline-offset-2"
                >
                  Full view →
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
