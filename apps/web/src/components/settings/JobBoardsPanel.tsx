'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { RefreshCw, Trash2, Plus, Loader2, Check, Pencil, Target as TargetIcon } from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { TargetEditorModal } from '@/components/jobs/TargetEditorModal'
import type { BoardName, JobBoardSource, JobTarget } from '@/types'

const BOARDS: { id: BoardName; label: string; description: string }[] = [
  { id: 'remotive',       label: 'Remotive',        description: 'JSON API · remote jobs · no auth required' },
  { id: 'remoteok',       label: 'Remote OK',        description: 'JSON API · remote jobs · attribution required' },
  { id: 'weworkremotely', label: 'WeWorkRemotely',   description: 'RSS feeds · remote jobs · attribution required' },
]

function BoardCard({ source, onPoll }: { source: JobBoardSource; onPoll: () => void }) {
  const qc = useQueryClient()
  const [polling, setPolling] = useState(false)
  const [justPolled, setJustPolled] = useState(false)

  const board = BOARDS.find((b) => b.id === source.board)

  const toggle = useMutation({
    mutationFn: () => api.jobBoards.patch(source.id, { enabled: !source.enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['job-board-sources'] }),
  })

  const remove = useMutation({
    mutationFn: () => api.jobBoards.delete(source.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['job-board-sources'] }),
  })

  async function handlePollNow() {
    setPolling(true)
    try {
      await api.jobBoards.pollNow(source.id)
      setJustPolled(true)
      setTimeout(() => setJustPolled(false), 3000)
      onPoll()
    } finally {
      setPolling(false)
    }
  }

  return (
    <div className="flex items-start justify-between gap-4 p-4 rounded-md bg-[var(--color-surface)] border border-[var(--color-border)]">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-[13px] font-semibold text-[var(--color-text)]">{board?.label ?? source.board}</p>
          <span className={cn(
            'text-[10px] font-medium px-1.5 py-0.5 rounded-full',
            source.enabled
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-[var(--color-bg)] text-[var(--color-muted)] border border-[var(--color-border)]',
          )}>
            {source.enabled ? 'Active' : 'Paused'}
          </span>
        </div>
        <p className="text-[11px] text-[var(--color-faint)]">{board?.description}</p>
        {source.last_polled_at && (
          <p className="text-[11px] text-[var(--color-faint)] mt-1">
            Last polled: {new Date(source.last_polled_at).toLocaleString()}
          </p>
        )}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={handlePollNow}
          disabled={polling}
          title="Poll now"
          className="flex items-center gap-1 h-7 px-2.5 rounded-sm text-[11px] font-medium bg-[var(--color-surface-sunken)] text-[var(--color-muted)] hover:bg-[var(--color-border)] transition-colors disabled:opacity-40"
        >
          {polling ? (
            <Loader2 size={11} className="animate-spin" />
          ) : justPolled ? (
            <Check size={11} className="text-success" />
          ) : (
            <RefreshCw size={11} strokeWidth={1.5} />
          )}
          {justPolled ? 'Queued' : 'Poll now'}
        </button>
        <button
          onClick={() => toggle.mutate()}
          disabled={toggle.isPending}
          className="h-7 px-2.5 rounded-sm text-[11px] font-medium bg-[var(--color-surface-sunken)] text-[var(--color-muted)] hover:bg-[var(--color-border)] transition-colors disabled:opacity-40"
        >
          {source.enabled ? 'Pause' : 'Resume'}
        </button>
        <button
          onClick={() => remove.mutate()}
          disabled={remove.isPending}
          title="Remove board"
          className="h-7 px-2 rounded-sm text-[var(--color-faint)] hover:text-danger hover:bg-danger/10 transition-colors disabled:opacity-40"
        >
          <Trash2 size={13} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  )
}

function AddBoardForm({ existing, onDone }: { existing: string[]; onDone: () => void }) {
  const qc = useQueryClient()
  const [board, setBoard] = useState<BoardName>('remotive')
  const [interval, setInterval] = useState(360)

  const add = useMutation({
    mutationFn: () =>
      api.jobBoards.upsert({
        board,
        enabled: true,
        poll_interval_minutes: interval,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['job-board-sources'] })
      onDone()
    },
  })

  const available = BOARDS.filter((b) => !existing.includes(b.id))
  if (!available.length) return null

  return (
    <div className="p-4 rounded-md border border-dashed border-[var(--color-border)] space-y-3">
      <p className="text-[12px] font-semibold text-[var(--color-text)]">Add board</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] text-[var(--color-muted)] mb-1 block">Board</label>
          <select
            value={board}
            onChange={(e) => setBoard(e.target.value as BoardName)}
            className="w-full text-[12px] bg-[var(--color-surface-sunken)] border border-[var(--color-border)] rounded px-2 py-1.5 text-[var(--color-text)]"
          >
            {available.map((b) => (
              <option key={b.id} value={b.id}>{b.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[11px] text-[var(--color-muted)] mb-1 block">Poll every (min)</label>
          <input
            type="number"
            min={60}
            max={1440}
            value={interval}
            onChange={(e) => setInterval(Number(e.target.value))}
            className="w-full text-[12px] bg-[var(--color-surface-sunken)] border border-[var(--color-border)] rounded px-2 py-1.5 text-[var(--color-text)]"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => add.mutate()}
          disabled={add.isPending}
          className="flex items-center gap-1.5 h-7 px-3 rounded-sm text-[12px] font-medium bg-[var(--color-text)] text-[var(--color-bg)] hover:opacity-80 transition-opacity disabled:opacity-40"
        >
          {add.isPending ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
          Add
        </button>
        <button
          onClick={onDone}
          className="h-7 px-3 rounded-sm text-[12px] text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

function targetSummary(t: JobTarget): string {
  const parts: string[] = []
  if (t.work_models.length) parts.push(t.work_models.join('/'))
  if (t.seniority.length) parts.push(t.seniority.join('/'))
  if (t.locations.length) parts.push(t.locations.join(', '))
  if (t.min_salary != null) parts.push(`≥ ${t.min_salary}`)
  return parts.join(' · ') || 'no conditions'
}

function TargetsManager() {
  const qc = useQueryClient()
  const [modal, setModal] = useState<{ open: boolean; target: JobTarget | null }>({ open: false, target: null })

  const { data: targets = [], isLoading } = useQuery({
    queryKey: ['job-targets'],
    queryFn: () => api.jobTargets.list(),
    staleTime: 30_000,
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['job-targets'] })
    qc.invalidateQueries({ queryKey: ['job-targets-recommendations'] })
  }
  const toggle = useMutation({
    mutationFn: (t: JobTarget) => api.jobTargets.update(t.id, { status: t.status === 'active' ? 'paused' : 'active' }),
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: (id: string) => api.jobTargets.delete(id),
    onSuccess: invalidate,
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[14px] font-semibold text-[var(--color-text)]">Search Targets</h3>
          <p className="text-[12px] text-[var(--color-muted)] mt-0.5">
            Named searches that decide which jobs get pulled in and how they’re ranked. Without an active target, nothing is ingested.
          </p>
        </div>
        <button
          onClick={() => setModal({ open: true, target: null })}
          className="flex items-center gap-1.5 h-7 px-3 rounded-sm text-[12px] font-medium bg-[var(--color-surface-sunken)] text-[var(--color-text)] hover:bg-[var(--color-border)] transition-colors"
        >
          <Plus size={12} strokeWidth={1.5} />New target
        </button>
      </div>

      {isLoading ? (
        <div className="h-16 rounded-md bg-[var(--color-surface)] border border-[var(--color-border)] animate-pulse" />
      ) : targets.length === 0 ? (
        <div className="p-6 rounded-md border border-dashed border-[var(--color-border)] text-center">
          <p className="text-[13px] text-[var(--color-muted)]">No targets yet.</p>
          <button onClick={() => setModal({ open: true, target: null })} className="mt-2 text-[12px] font-medium text-[var(--color-text)] underline underline-offset-2">
            Create your first target
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {targets.map((t) => (
            <div key={t.id} className="flex items-start justify-between gap-4 p-3.5 rounded-md bg-[var(--color-surface)] border border-[var(--color-border)]">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <TargetIcon size={13} className="text-[var(--color-muted)]" />
                  <p className="text-[13px] font-semibold text-[var(--color-text)]">{t.label}</p>
                  <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded-full',
                    t.status === 'active' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-[var(--color-bg)] text-[var(--color-muted)] border border-[var(--color-border)]')}>
                    {t.status === 'active' ? 'Active' : 'Paused'}
                  </span>
                  <span className="text-[11px] text-[var(--color-faint)]">{t.opportunity_count ?? 0} matched</span>
                </div>
                <p className="text-[11px] text-[var(--color-muted)]">
                  {(t.role_titles.length ? t.role_titles.join(', ') : t.keywords.join(', ')) || '—'}
                </p>
                <p className="text-[11px] text-[var(--color-faint)] mt-0.5">{targetSummary(t)}</p>
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                <button onClick={() => setModal({ open: true, target: t })} title="Edit" className="h-7 w-7 flex items-center justify-center rounded-sm text-[var(--color-faint)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg)] transition-colors"><Pencil size={13} strokeWidth={1.5} /></button>
                <button onClick={() => toggle.mutate(t)} disabled={toggle.isPending} className="h-7 px-2 rounded-sm text-[11px] font-medium text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg)] transition-colors disabled:opacity-40">
                  {t.status === 'active' ? 'Pause' : 'Resume'}
                </button>
                <button onClick={() => { if (confirm(`Delete target "${t.label}"?`)) remove.mutate(t.id) }} disabled={remove.isPending} title="Delete" className="h-7 w-7 flex items-center justify-center rounded-sm text-[var(--color-faint)] hover:text-danger hover:bg-danger/10 transition-colors disabled:opacity-40"><Trash2 size={13} strokeWidth={1.5} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal.open && <TargetEditorModal target={modal.target} onClose={() => setModal({ open: false, target: null })} />}
    </div>
  )
}

export function JobBoardsPanel() {
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)

  const { data: sources = [], isLoading } = useQuery({
    queryKey: ['job-board-sources'],
    queryFn: () => api.jobBoards.list(),
    staleTime: 30_000,
  })

  const existingBoards = sources.map((s) => s.board)
  const canAddMore = existingBoards.length < BOARDS.length

  return (
    <div className="space-y-8">
      <TargetsManager />

      <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[14px] font-semibold text-[var(--color-text)]">Job Boards</h3>
          <p className="text-[12px] text-[var(--color-muted)] mt-0.5">
            Official feeds only — no scraping. Channels to pull from; your Search Targets decide what’s kept.
          </p>
        </div>
        {canAddMore && !showAdd && (
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 h-7 px-3 rounded-sm text-[12px] font-medium bg-[var(--color-surface-sunken)] text-[var(--color-text)] hover:bg-[var(--color-border)] transition-colors"
          >
            <Plus size={12} strokeWidth={1.5} />
            Add board
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-20 rounded-md bg-[var(--color-surface)] border border-[var(--color-border)] animate-pulse" />
          ))}
        </div>
      ) : sources.length === 0 && !showAdd ? (
        <div className="p-6 rounded-md border border-dashed border-[var(--color-border)] text-center">
          <p className="text-[13px] text-[var(--color-muted)]">No boards configured.</p>
          <button
            onClick={() => setShowAdd(true)}
            className="mt-2 text-[12px] font-medium text-[var(--color-text)] underline underline-offset-2"
          >
            Add your first board
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {sources.map((source) => (
            <BoardCard
              key={source.id}
              source={source}
              onPoll={() => qc.invalidateQueries({ queryKey: ['opportunities'] })}
            />
          ))}
        </div>
      )}

      {showAdd && (
        <AddBoardForm
          existing={existingBoards}
          onDone={() => setShowAdd(false)}
        />
      )}
      </div>
    </div>
  )
}
