'use client'
import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  MapPin, DollarSign, Clock, ChevronRight, Target as TargetIcon,
  Plus, Pencil, Trash2, Sparkles, SlidersHorizontal, CircleDot, HelpCircle,
} from 'lucide-react'
import { api } from '@/lib/api'
import { cn, formatRelative, titleCase } from '@/lib/utils'
import { TargetEditorModal } from '@/components/jobs/TargetEditorModal'
import type { Opportunity, WorkModel, JobTarget, FitTier, TargetTiers } from '@/types'

const JOBS_FEED_KEY = 'careeros_jobs_feed'

const TIER_META: Record<FitTier, { label: string; hint?: string; icon: typeof CircleDot; cls: string }> = {
  on_target:   { label: 'On target',         icon: TargetIcon,  cls: 'text-emerald-700' },
  adjacent:    { label: 'Adjacent fit',       hint: 'your skills qualify you', icon: Sparkles, cls: 'text-violet-700' },
  unconfirmed: { label: 'Needs confirmation', hint: 'some conditions unverified', icon: HelpCircle, cls: 'text-amber-700' },
}

// ── Job card ──────────────────────────────────────────────────
function WorkModelPill({ model }: { model?: WorkModel }) {
  if (!model || model === 'unknown') return null
  const color =
    model === 'remote' ? 'bg-sky-50 text-sky-700 border-sky-200' :
    model === 'hybrid' ? 'bg-violet-50 text-violet-700 border-violet-200' :
                         'bg-[var(--color-surface-sunken)] text-[var(--color-muted)] border-[var(--color-border)]'
  return <span className={cn('text-[11px] px-2 py-0.5 rounded-full border font-medium', color)}>{titleCase(model)}</span>
}

function JobCard({ job, adjacent, onClick }: { job: Opportunity; adjacent?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group w-full text-left bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md p-4 hover:border-[var(--color-text)] hover:shadow-sm transition-all duration-150"
    >
      <div className="flex items-start gap-3.5">
        <div className="shrink-0 w-9 h-9 rounded-sm bg-[var(--color-surface-sunken)] border border-[var(--color-border)] flex items-center justify-center text-[12px] font-bold text-[var(--color-muted)] select-none">
          {(job.company_name ?? job.role_title).charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3 mb-1">
            <h3 className="text-[13.5px] font-semibold text-[var(--color-text)] leading-snug">{job.role_title}</h3>
            <div className="flex items-center gap-2 shrink-0">
              {adjacent && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200">
                  <Sparkles size={9} /> skills fit
                </span>
              )}
              <ChevronRight size={14} strokeWidth={1.5} className="text-[var(--color-faint)] group-hover:text-[var(--color-muted)] transition-colors" />
            </div>
          </div>
          <p className="text-[12.5px] text-[var(--color-muted)] mb-2">{job.company_name ?? 'Unknown Company'}</p>
          <div className="flex flex-wrap items-center gap-2">
            <WorkModelPill model={job.work_model} />
            {job.location && (
              <span className="flex items-center gap-1 text-[11px] text-[var(--color-muted)]"><MapPin size={10} strokeWidth={1.5} />{job.location}</span>
            )}
            {job.salary_text && (
              <span className="flex items-center gap-1 text-[11px] text-[var(--color-muted)]"><DollarSign size={10} strokeWidth={1.5} />{job.salary_text}</span>
            )}
            <span className="flex items-center gap-1 text-[11px] text-[var(--color-faint)]"><Clock size={10} strokeWidth={1.5} />{formatRelative(job.created_at)}</span>
          </div>
        </div>
      </div>
    </button>
  )
}

// ── Tier section ──────────────────────────────────────────────
function TierSection({ tier, jobs, onOpen }: { tier: FitTier; jobs: Opportunity[]; onOpen: (j: Opportunity) => void }) {
  if (jobs.length === 0) return null
  const meta = TIER_META[tier]
  const Icon = meta.icon
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 pl-0.5">
        <Icon size={12} className={meta.cls} />
        <span className={cn('text-[11px] font-semibold uppercase tracking-wide', meta.cls)}>{meta.label}</span>
        {meta.hint && <span className="text-[11px] text-[var(--color-faint)]">· {meta.hint}</span>}
        <span className="text-[11px] text-[var(--color-faint)]">· {jobs.length}</span>
      </div>
      <div className="space-y-2">
        {jobs.map((j) => (
          <JobCard key={j.id} job={j} adjacent={tier === 'adjacent'} onClick={() => onOpen(j)} />
        ))}
      </div>
    </div>
  )
}

// ── Target group ──────────────────────────────────────────────
function TargetGroup({
  target, tiers, count, onOpen, onEdit,
}: {
  target: JobTarget; tiers: TargetTiers; count: number; onOpen: (j: Opportunity) => void; onEdit: () => void
}) {
  const qc = useQueryClient()
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['job-targets-recommendations'] })
    qc.invalidateQueries({ queryKey: ['job-targets'] })
  }
  const toggle = useMutation({
    mutationFn: () => api.jobTargets.update(target.id, { status: target.status === 'active' ? 'paused' : 'active' }),
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: () => api.jobTargets.delete(target.id),
    onSuccess: invalidate,
  })

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-2 min-w-0">
          <TargetIcon size={14} className="text-[var(--color-muted)] shrink-0" />
          <h2 className="text-[14px] font-semibold text-[var(--color-text)] truncate">{target.label}</h2>
          <span className="text-[12px] text-[var(--color-faint)]">{count} {count === 1 ? 'job' : 'jobs'}</span>
          {target.status === 'paused' && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-[var(--color-bg)] text-[var(--color-muted)] border border-[var(--color-border)]">Paused</span>
          )}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button onClick={onEdit} title="Edit" className="h-7 w-7 flex items-center justify-center rounded-sm text-[var(--color-faint)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg)] transition-colors"><Pencil size={13} strokeWidth={1.5} /></button>
          <button onClick={() => toggle.mutate()} disabled={toggle.isPending} className="h-7 px-2 rounded-sm text-[11px] font-medium text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg)] transition-colors disabled:opacity-40">
            {target.status === 'active' ? 'Pause' : 'Resume'}
          </button>
          <button onClick={() => { if (confirm(`Delete target "${target.label}"?`)) remove.mutate() }} disabled={remove.isPending} title="Delete" className="h-7 w-7 flex items-center justify-center rounded-sm text-[var(--color-faint)] hover:text-danger hover:bg-danger/10 transition-colors disabled:opacity-40"><Trash2 size={13} strokeWidth={1.5} /></button>
        </div>
      </div>

      {count === 0 ? (
        <p className="text-[12px] text-[var(--color-muted)] py-2 pl-0.5">No matches yet — jobs surface here as boards are polled.</p>
      ) : (
        <div className="space-y-4">
          <TierSection tier="on_target" jobs={tiers.on_target} onOpen={onOpen} />
          <TierSection tier="adjacent" jobs={tiers.adjacent} onOpen={onOpen} />
          <TierSection tier="unconfirmed" jobs={tiers.unconfirmed} onOpen={onOpen} />
        </div>
      )}
    </section>
  )
}

// ── Page ──────────────────────────────────────────────────────
export default function JobsPage() {
  const router = useRouter()
  const [selected, setSelected] = useState<string | null>(null) // target id or null = all
  const [modal, setModal] = useState<{ open: boolean; target: JobTarget | null }>({ open: false, target: null })

  const { data, isLoading } = useQuery({
    queryKey: ['job-targets-recommendations'],
    queryFn: () => api.jobTargets.recommendations(),
    staleTime: 30_000,
  })

  const targets = data?.targets ?? []
  const untargeted = data?.untargeted ?? []
  const totals = data?.totals ?? { matched: 0, untargeted: 0 }

  const openJob = useCallback((job: Opportunity, all: Opportunity[]) => {
    sessionStorage.setItem(JOBS_FEED_KEY, JSON.stringify({ ids: all.map((j) => j.id), index: all.findIndex((j) => j.id === job.id) }))
    router.push(`/jobs/${job.id}`)
  }, [router])

  const visibleTargets = selected ? targets.filter((t) => t.id === selected) : targets
  const showUntargeted = selected === null && untargeted.length > 0

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-semibold text-[var(--color-text)]">Jobs</h1>
          <p className="text-[13px] text-[var(--color-muted)] mt-0.5">
            {targets.length > 0
              ? `${totals.matched} matched across ${targets.length} target${targets.length !== 1 ? 's' : ''}`
              : 'Create a target to tell CareerOS what you’re hunting for'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a href="/settings" className="flex items-center gap-1.5 h-8 px-3 rounded-sm text-[12px] text-[var(--color-muted)] border border-[var(--color-border)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg)] transition-colors">
            <SlidersHorizontal size={12} strokeWidth={1.5} />Sources
          </a>
          <button onClick={() => setModal({ open: true, target: null })} className="flex items-center gap-1.5 h-8 px-3 rounded-md bg-[var(--color-text)] text-[var(--color-bg)] text-[12px] font-medium hover:opacity-90 transition-opacity">
            <Plus size={13} />New Target
          </button>
        </div>
      </div>

      {/* Target chips */}
      {targets.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setSelected(null)}
            className={cn('h-7 px-3 rounded-full text-[11.5px] font-medium border transition-colors',
              selected === null ? 'bg-[var(--color-text)] text-[var(--color-bg)] border-[var(--color-text)]' : 'bg-[var(--color-surface)] text-[var(--color-muted)] border-[var(--color-border)] hover:text-[var(--color-text)]')}
          >
            All
          </button>
          {targets.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelected(t.id)}
              className={cn('h-7 px-3 rounded-full text-[11.5px] font-medium border transition-colors flex items-center gap-1.5',
                selected === t.id ? 'bg-[var(--color-text)] text-[var(--color-bg)] border-[var(--color-text)]' : 'bg-[var(--color-surface)] text-[var(--color-muted)] border-[var(--color-border)] hover:text-[var(--color-text)]')}
            >
              {t.label}
              <span className={cn('text-[10px]', selected === t.id ? 'opacity-70' : 'text-[var(--color-faint)]')}>{t.count}</span>
            </button>
          ))}
        </div>
      )}

      {/* Body */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 rounded-md bg-[var(--color-surface)] border border-[var(--color-border)] animate-pulse" />)}
        </div>
      ) : targets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <TargetIcon size={36} strokeWidth={1} className="text-[var(--color-faint)] mb-3" />
          <p className="text-[14px] font-medium text-[var(--color-text)] mb-1">No job targets yet</p>
          <p className="text-[13px] text-[var(--color-muted)] max-w-xs mb-4">
            A target is a saved search — a role plus conditions like location and seniority. It’s what filters and ranks every incoming job.
          </p>
          <button onClick={() => setModal({ open: true, target: null })} className="flex items-center gap-1.5 h-8 px-3 rounded-md bg-[var(--color-text)] text-[var(--color-bg)] text-[12px] font-medium hover:opacity-90 transition-opacity">
            <Plus size={13} />Create your first target
          </button>
        </div>
      ) : (
        <div className="space-y-7">
          {visibleTargets.map((t) => (
            <TargetGroup
              key={t.id}
              target={t}
              tiers={t.tiers}
              count={t.count}
              onOpen={(j) => openJob(j, [...t.tiers.on_target, ...t.tiers.adjacent, ...t.tiers.unconfirmed])}
              onEdit={() => setModal({ open: true, target: t })}
            />
          ))}

          {showUntargeted && (
            <section className="space-y-3">
              <div className="flex items-center gap-2 pb-1.5 border-b border-[var(--color-border)]">
                <CircleDot size={14} className="text-[var(--color-faint)]" />
                <h2 className="text-[14px] font-semibold text-[var(--color-muted)]">Untargeted</h2>
                <span className="text-[12px] text-[var(--color-faint)]">{totals.untargeted}</span>
              </div>
              <p className="text-[11px] text-[var(--color-faint)] pl-0.5">Jobs you added or were sent that don’t match an active target.</p>
              <div className="space-y-2">
                {untargeted.map((j) => <JobCard key={j.id} job={j} onClick={() => openJob(j, untargeted)} />)}
              </div>
            </section>
          )}
        </div>
      )}

      {modal.open && <TargetEditorModal target={modal.target} onClose={() => setModal({ open: false, target: null })} />}
    </div>
  )
}
