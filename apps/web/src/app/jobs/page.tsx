'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import {
  Search,
  MapPin,
  DollarSign,
  Clock,
  ExternalLink,
  Radar,
  SlidersHorizontal,
  ChevronRight,
  Zap,
} from 'lucide-react'
import { api } from '@/lib/api'
import { cn, formatRelative, titleCase } from '@/lib/utils'
import type { Opportunity, WorkModel } from '@/types'

// ── Constants ─────────────────────────────────────────────────

const WORK_MODELS: { value: WorkModel | 'all'; label: string }[] = [
  { value: 'all',    label: 'All' },
  { value: 'remote', label: 'Remote' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'onsite', label: 'Onsite' },
]

const CATEGORIES = [
  { value: '', label: 'All categories' },
  { value: 'engineering', label: 'Engineering' },
  { value: 'product', label: 'Product' },
  { value: 'design', label: 'Design' },
  { value: 'data', label: 'Data & ML' },
  { value: 'devops', label: 'DevOps' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'sales', label: 'Sales' },
  { value: 'support', label: 'Support' },
]

const DATE_RANGES = [
  { value: '', label: 'Any time' },
  { value: '24h', label: 'Last 24h' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
]

const JOBS_FEED_KEY = 'careeros_jobs_feed'

// ── Job card ──────────────────────────────────────────────────

function MatchBadge({ score }: { score: number }) {
  const color =
    score >= 85 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
    score >= 70 ? 'bg-amber-50 text-amber-700 border-amber-200' :
                  'bg-[var(--color-surface-sunken)] text-[var(--color-muted)] border-[var(--color-border)]'
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-bold tabular', color)}>
      <Zap size={9} strokeWidth={2} />
      {score}% match
    </span>
  )
}

function WorkModelPill({ model }: { model?: WorkModel }) {
  if (!model || model === 'unknown') return null
  const color =
    model === 'remote' ? 'bg-sky-50 text-sky-700 border-sky-200' :
    model === 'hybrid' ? 'bg-violet-50 text-violet-700 border-violet-200' :
                         'bg-[var(--color-surface-sunken)] text-[var(--color-muted)] border-[var(--color-border)]'
  return (
    <span className={cn('text-[11px] px-2 py-0.5 rounded-full border font-medium', color)}>
      {titleCase(model)}
    </span>
  )
}

function JobCard({
  job,
  index,
  feedIds,
  onClick,
}: {
  job: Opportunity
  index: number
  feedIds: string[]
  onClick: () => void
}) {
  const score = job.match_score?.score
  const matched = (job.required_skills ?? []).filter(
    (s) => !(job.match_score?.missing_skills ?? []).includes(s),
  )
  const missing = job.match_score?.missing_skills ?? []

  return (
    <button
      onClick={onClick}
      className="group w-full text-left bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md p-5 hover:border-[var(--color-text)] hover:shadow-sm transition-all duration-150"
    >
      <div className="flex items-start gap-4">
        {/* Company avatar */}
        <div className="shrink-0 w-10 h-10 rounded-sm bg-[var(--color-surface-sunken)] border border-[var(--color-border)] flex items-center justify-center text-[13px] font-bold text-[var(--color-muted)] select-none">
          {(job.company_name ?? job.role_title).charAt(0).toUpperCase()}
        </div>

        <div className="flex-1 min-w-0">
          {/* Top row: role + match badge */}
          <div className="flex items-start justify-between gap-3 mb-1">
            <h3 className="text-[14px] font-semibold text-[var(--color-text)] leading-snug group-hover:text-[var(--color-text)]">
              {job.role_title}
            </h3>
            <div className="flex items-center gap-2 shrink-0">
              {score !== undefined && <MatchBadge score={Math.round(score)} />}
              <ChevronRight size={14} strokeWidth={1.5} className="text-[var(--color-faint)] group-hover:text-[var(--color-muted)] transition-colors" />
            </div>
          </div>

          {/* Company + location row */}
          <p className="text-[13px] text-[var(--color-muted)] mb-2.5">
            {job.company_name ?? 'Unknown Company'}
            {job.company_industry && (
              <span className="text-[var(--color-faint)]"> · {job.company_industry}</span>
            )}
          </p>

          {/* Meta badges */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <WorkModelPill model={job.work_model} />
            {job.location && (
              <span className="flex items-center gap-1 text-[11px] text-[var(--color-muted)]">
                <MapPin size={10} strokeWidth={1.5} />
                {job.location}
              </span>
            )}
            {job.salary_text && (
              <span className="flex items-center gap-1 text-[11px] text-[var(--color-muted)]">
                <DollarSign size={10} strokeWidth={1.5} />
                {job.salary_text}
              </span>
            )}
            <span className="flex items-center gap-1 text-[11px] text-[var(--color-faint)]">
              <Clock size={10} strokeWidth={1.5} />
              {formatRelative(job.created_at)}
            </span>
          </div>

          {/* Skills */}
          {(matched.length > 0 || missing.length > 0) && (
            <div className="flex flex-wrap gap-1.5">
              {matched.slice(0, 5).map((s) => (
                <span key={s} className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {s}
                </span>
              ))}
              {missing.slice(0, 3).map((s) => (
                <span key={s} className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                  ⚠ {s}
                </span>
              ))}
              {job.required_skills?.filter((s) => !matched.includes(s) && !missing.includes(s)).slice(0, 3).map((s) => (
                <span key={s} className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-surface-sunken)] text-[var(--color-faint)]">
                  {s}
                </span>
              ))}
            </div>
          )}
          {!job.match_score && (job.required_skills?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {(job.required_skills ?? []).slice(0, 6).map((s) => (
                <span key={s} className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-surface-sunken)] text-[var(--color-faint)]">
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </button>
  )
}

// ── Empty state ───────────────────────────────────────────────

function EmptyState({ hasBoards }: { hasBoards: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <Radar size={36} strokeWidth={1} className="text-[var(--color-faint)] mb-3" />
      <p className="text-[14px] font-medium text-[var(--color-text)] mb-1">
        {hasBoards ? 'No jobs match your filters' : 'No job boards configured'}
      </p>
      <p className="text-[13px] text-[var(--color-muted)] max-w-xs">
        {hasBoards
          ? 'Try adjusting your search or filters, or wait for the next poll cycle.'
          : 'Go to Settings → Job Boards to connect Remotive, RemoteOK, or WeWorkRemotely.'}
      </p>
      {!hasBoards && (
        <a
          href="/settings"
          className="mt-4 text-[12px] font-medium text-[var(--color-text)] underline underline-offset-2"
        >
          Configure job boards →
        </a>
      )}
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────

export default function JobsPage() {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [workModel, setWorkModel] = useState<WorkModel | 'all'>('all')
  const [category, setCategory] = useState('')
  const [since, setSince] = useState('')

  // Debounce keyword input
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 350)
    return () => clearTimeout(t)
  }, [q])

  const { data, isLoading } = useQuery({
    queryKey: ['jobs-feed', { q: debouncedQ, workModel, category, since }],
    queryFn: () =>
      api.opportunities.list({
        source: 'job_board',
        limit: 50,
        with_company: true,
        with_match: true,
        q: debouncedQ || undefined,
        work_model: workModel === 'all' ? undefined : workModel,
        since: since || undefined,
      }),
    staleTime: 60_000,
  })

  const { data: boardsData } = useQuery({
    queryKey: ['job-board-sources'],
    queryFn: () => api.jobBoards.list(),
    staleTime: 60_000,
  })

  const jobs = data?.items ?? []
  const hasBoards = (boardsData?.length ?? 0) > 0

  const handleJobClick = useCallback((job: Opportunity, index: number, allJobs: Opportunity[]) => {
    // Persist feed context so the detail page can do prev/next
    sessionStorage.setItem(
      JOBS_FEED_KEY,
      JSON.stringify({ ids: allJobs.map((j) => j.id), index }),
    )
    router.push(`/jobs/${job.id}`)
  }, [router])

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-semibold text-[var(--color-text)]">Jobs</h1>
          <p className="text-[13px] text-[var(--color-muted)] mt-0.5">
            {jobs.length > 0
              ? `${jobs.length} job${jobs.length !== 1 ? 's' : ''} · sorted by match`
              : 'Curated from your connected job boards'}
          </p>
        </div>
        <a
          href="/settings"
          className="flex items-center gap-1.5 h-8 px-3 rounded-sm text-[12px] text-[var(--color-muted)] border border-[var(--color-border)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg)] transition-colors"
        >
          <SlidersHorizontal size={12} strokeWidth={1.5} />
          Sources
        </a>
      </div>

      {/* Filter bar */}
      <div className="flex flex-col gap-3">
        {/* Keyword search */}
        <div className="relative">
          <Search size={14} strokeWidth={1.5} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-faint)]" />
          <input
            type="text"
            placeholder="Search job titles…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full pl-9 pr-4 h-9 rounded-sm bg-[var(--color-surface)] border border-[var(--color-border)] text-[13px] text-[var(--color-text)] placeholder:text-[var(--color-faint)] focus:outline-none focus:border-[var(--color-text)] transition-colors"
          />
        </div>

        {/* Filter pills row */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Work model */}
          <div className="flex items-center gap-1 p-0.5 rounded-sm bg-[var(--color-surface-sunken)] border border-[var(--color-border)]">
            {WORK_MODELS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setWorkModel(value as WorkModel | 'all')}
                className={cn(
                  'h-6 px-3 rounded-[3px] text-[11px] font-medium transition-colors',
                  workModel === value
                    ? 'bg-[var(--color-text)] text-[var(--color-bg)]'
                    : 'text-[var(--color-muted)] hover:text-[var(--color-text)]',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Category */}
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="h-8 px-3 rounded-sm bg-[var(--color-surface)] border border-[var(--color-border)] text-[12px] text-[var(--color-muted)] focus:outline-none focus:border-[var(--color-text)] transition-colors"
          >
            {CATEGORIES.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>

          {/* Date */}
          <select
            value={since}
            onChange={(e) => setSince(e.target.value)}
            className="h-8 px-3 rounded-sm bg-[var(--color-surface)] border border-[var(--color-border)] text-[12px] text-[var(--color-muted)] focus:outline-none focus:border-[var(--color-text)] transition-colors"
          >
            {DATE_RANGES.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Job list */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-28 rounded-md bg-[var(--color-surface)] border border-[var(--color-border)] animate-pulse" />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <EmptyState hasBoards={hasBoards} />
      ) : (
        <div className="space-y-3">
          {jobs.map((job, i) => (
            <JobCard
              key={job.id}
              job={job}
              index={i}
              feedIds={jobs.map((j) => j.id)}
              onClick={() => handleJobClick(job, i, jobs)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
