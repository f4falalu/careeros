'use client'
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Lock, Unlock, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { JobTarget, WorkModel, TargetLocks, CreateJobTargetInput } from '@/types'

const SENIORITY_OPTIONS = ['intern', 'junior', 'mid', 'senior', 'lead', 'exec'] as const
const WORK_MODEL_OPTIONS: WorkModel[] = ['remote', 'hybrid', 'onsite']

function toList(s: string): string[] {
  return s.split(',').map((x) => x.trim()).filter(Boolean)
}

// Locked conditions are strict gates; unlocked are soft signals the capability match can override.
const DEFAULT_LOCKS: TargetLocks = { location: true, work_model: true }

export function TargetEditorModal({ target, onClose }: { target?: JobTarget | null; onClose: () => void }) {
  const qc = useQueryClient()
  const editing = !!target

  const [label, setLabel] = useState(target?.label ?? '')
  const [roleTitles, setRoleTitles] = useState((target?.role_titles ?? []).join(', '))
  const [keywords, setKeywords] = useState((target?.keywords ?? []).join(', '))
  const [locations, setLocations] = useState((target?.locations ?? []).join(', '))
  const [seniority, setSeniority] = useState<string[]>(target?.seniority ?? [])
  const [workModels, setWorkModels] = useState<WorkModel[]>(target?.work_models ?? [])
  const [minSalary, setMinSalary] = useState<string>(target?.min_salary != null ? String(target.min_salary) : '')
  const [locks, setLocks] = useState<TargetLocks>(target?.locks ?? DEFAULT_LOCKS)

  const hasIntent = toList(roleTitles).length > 0 || toList(keywords).length > 0
  const hasCondition =
    seniority.length > 0 || toList(locations).length > 0 || workModels.length > 0 || minSalary.trim() !== ''
  const valid = label.trim().length > 0 && (hasIntent || hasCondition)

  const save = useMutation({
    mutationFn: () => {
      const payload: CreateJobTargetInput = {
        label: label.trim(),
        role_titles: toList(roleTitles),
        keywords: toList(keywords),
        seniority,
        locations: toList(locations),
        work_models: workModels,
        min_salary: minSalary.trim() ? Number(minSalary) : null,
        locks,
      }
      return editing ? api.jobTargets.update(target!.id, payload) : api.jobTargets.create(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['job-targets'] })
      qc.invalidateQueries({ queryKey: ['job-targets-recommendations'] })
      onClose()
    },
  })

  function toggle<T>(list: T[], setter: (v: T[]) => void, value: T) {
    setter(list.includes(value) ? list.filter((x) => x !== value) : [...list, value])
  }

  const fieldCls =
    'w-full text-[12px] bg-[var(--color-surface-sunken)] border border-[var(--color-border)] rounded px-2.5 py-2 text-[var(--color-text)] placeholder:text-[var(--color-faint)] focus:outline-none focus:border-[var(--color-border-strong)] transition-colors'
  const labelCls = 'text-[11px] font-medium text-[var(--color-muted)] mb-1 block'

  // Label row with an inline lock toggle. Locked = strict gate; unlocked = soft signal.
  function condLabel(text: string, k: keyof TargetLocks, hint?: string) {
    const on = locks[k] === true
    return (
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-medium text-[var(--color-muted)]">
          {text}
          {hint && <span className="text-[var(--color-faint)]"> · {hint}</span>}
        </span>
        <button
          type="button"
          onClick={() => setLocks({ ...locks, [k]: !on })}
          title={on ? 'Locked — strict gate (violations dropped)' : 'Unlocked — soft signal (influences ranking only)'}
          className={cn(
            'flex items-center gap-1 h-5 pl-1.5 pr-2 rounded-full text-[10px] font-medium border transition-colors',
            on
              ? 'bg-amber-50 text-amber-700 border-amber-200'
              : 'bg-[var(--color-surface-sunken)] text-[var(--color-faint)] border-[var(--color-border)] hover:text-[var(--color-muted)]',
          )}
        >
          {on ? <Lock size={10} /> : <Unlock size={10} />}
          {on ? 'Gate' : 'Soft'}
        </button>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-[88vh] overflow-y-auto rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--color-border)] sticky top-0 bg-[var(--color-surface)]">
          <h2 className="text-[14px] font-semibold text-[var(--color-text)]">
            {editing ? 'Edit job target' : 'New job target'}
          </h2>
          <button onClick={onClose} className="text-[var(--color-faint)] hover:text-[var(--color-text)] transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Label */}
          <div>
            <label className={labelCls}>Name *</label>
            <input
              autoFocus
              className={fieldCls}
              placeholder="e.g. Product Manager"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>

          {/* Intent */}
          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className={labelCls}>Role titles <span className="text-[var(--color-faint)]">· intent, comma-separated</span></label>
              <input className={fieldCls} placeholder="Product Manager, Senior PM" value={roleTitles} onChange={(e) => setRoleTitles(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Keywords <span className="text-[var(--color-faint)]">· comma-separated</span></label>
              <input className={fieldCls} placeholder="product, roadmap, stakeholder" value={keywords} onChange={(e) => setKeywords(e.target.value)} />
            </div>
          </div>

          <div className="h-px bg-[var(--color-border)]" />
          <p className="text-[11px] text-[var(--color-muted)]">
            Conditions. Set a condition to <span className="text-amber-700 font-medium">Gate</span> to make it strict — jobs that clearly violate it are dropped. <span className="text-[var(--color-faint)]">Soft</span> conditions only influence ranking.
          </p>

          {/* Work model */}
          <div>
            {condLabel('Work model', 'work_model')}
            <div className="flex gap-1.5">
              {WORK_MODEL_OPTIONS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => toggle(workModels, setWorkModels, m)}
                  className={cn(
                    'h-7 px-3 rounded-sm text-[11px] font-medium capitalize border transition-colors',
                    workModels.includes(m)
                      ? 'bg-[var(--color-text)] text-[var(--color-bg)] border-[var(--color-text)]'
                      : 'bg-[var(--color-surface-sunken)] text-[var(--color-muted)] border-[var(--color-border)] hover:text-[var(--color-text)]',
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Seniority */}
          <div>
            {condLabel('Seniority', 'seniority')}
            <div className="flex flex-wrap gap-1.5">
              {SENIORITY_OPTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggle(seniority, setSeniority, s)}
                  className={cn(
                    'h-7 px-3 rounded-sm text-[11px] font-medium capitalize border transition-colors',
                    seniority.includes(s)
                      ? 'bg-[var(--color-text)] text-[var(--color-bg)] border-[var(--color-text)]'
                      : 'bg-[var(--color-surface-sunken)] text-[var(--color-muted)] border-[var(--color-border)] hover:text-[var(--color-text)]',
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Locations */}
          <div>
            {condLabel('Locations', 'location', 'comma-separated')}
            <input className={fieldCls} placeholder="remote, worldwide, EU" value={locations} onChange={(e) => setLocations(e.target.value)} />
          </div>

          {/* Min salary */}
          <div>
            {condLabel('Min salary', 'min_salary')}
            <input className={fieldCls} type="number" min={0} placeholder="e.g. 80000" value={minSalary} onChange={(e) => setMinSalary(e.target.value)} />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-5 py-3.5 border-t border-[var(--color-border)] sticky bottom-0 bg-[var(--color-surface)]">
          <span className="text-[11px] text-[var(--color-faint)]">
            {!valid && 'Add a name and at least one role, keyword, or condition.'}
            {save.isError && <span className="text-danger">{String((save.error as Error)?.message ?? 'Failed')}</span>}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className="h-8 px-3 rounded-md text-[12px] text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors">
              Cancel
            </button>
            <button
              onClick={() => save.mutate()}
              disabled={!valid || save.isPending}
              className="flex items-center gap-1.5 h-8 px-4 rounded-md text-[12px] font-medium bg-[var(--color-text)] text-[var(--color-bg)] hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              {save.isPending && <Loader2 size={12} className="animate-spin" />}
              {editing ? 'Save' : 'Create target'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
