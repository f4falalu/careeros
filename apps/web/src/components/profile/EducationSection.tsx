'use client'
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, GraduationCap, X } from 'lucide-react'
import { api } from '@/lib/api'
import type { Education } from '@/types'

const EMPTY: Omit<Education, 'id' | 'created_at'> = {
  institution: '',
  degree: '',
  field: '',
  start_date: '',
  end_date: '',
  grade: '',
  activities: [],
  sort_order: 0,
}

type FormState = {
  institution: string
  degree: string
  field: string
  start_date: string
  end_date: string
  grade: string
  activities: string
  sort_order: number
}

function EducationModal({
  initial,
  onClose,
  onSave,
  saving,
}: {
  initial: FormState
  onClose: () => void
  onSave: (f: FormState) => void
  saving: boolean
}) {
  const [form, setForm] = useState(initial)
  const set = (k: keyof FormState, v: string | number) =>
    setForm((f) => ({ ...f, [k]: v }))

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md shadow-panel w-[540px] max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
          <h3 className="text-[14px] font-semibold text-[var(--color-text)]">
            {initial.institution ? 'Edit Education' : 'Add Education'}
          </h3>
          <button onClick={onClose} className="text-[var(--color-faint)] hover:text-[var(--color-muted)]">
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-[11px] font-medium text-[var(--color-muted)] mb-1">
                Institution <span className="text-red-400">*</span>
              </label>
              <input
                className="field-input w-full"
                placeholder="University of Lagos"
                value={form.institution}
                onChange={(e) => set('institution', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[var(--color-muted)] mb-1">Degree</label>
              <input
                className="field-input w-full"
                placeholder="BSc, MSc, MBA…"
                value={form.degree}
                onChange={(e) => set('degree', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[var(--color-muted)] mb-1">Field of Study</label>
              <input
                className="field-input w-full"
                placeholder="Computer Science"
                value={form.field}
                onChange={(e) => set('field', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[var(--color-muted)] mb-1">Start Date</label>
              <input
                type="month"
                className="field-input w-full"
                value={form.start_date?.slice(0, 7) ?? ''}
                onChange={(e) => set('start_date', e.target.value ? `${e.target.value}-01` : '')}
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[var(--color-muted)] mb-1">End Date</label>
              <input
                type="month"
                className="field-input w-full"
                value={form.end_date?.slice(0, 7) ?? ''}
                onChange={(e) => set('end_date', e.target.value ? `${e.target.value}-01` : '')}
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[var(--color-muted)] mb-1">Grade / GPA</label>
              <input
                className="field-input w-full"
                placeholder="3.8 / 4.0 or First Class"
                value={form.grade}
                onChange={(e) => set('grade', e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-[var(--color-muted)] mb-1">
              Activities & Achievements
            </label>
            <p className="text-[10px] text-[var(--color-faint)] mb-1">One per line</p>
            <textarea
              rows={3}
              className="field-input w-full resize-none"
              placeholder="President, AI Society&#10;National Hackathon winner"
              value={form.activities}
              onChange={(e) => set('activities', e.target.value)}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-[var(--color-border)]">
          <button
            onClick={onClose}
            className="h-8 px-4 rounded-sm text-[12px] text-[var(--color-muted)] hover:bg-[var(--color-surface-sunken)]"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(form)}
            disabled={saving || !form.institution}
            className="h-8 px-4 rounded-sm text-[12px] font-medium bg-[var(--color-text)] text-[var(--color-bg)] hover:opacity-80 disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

function formatDateRange(start?: string | null, end?: string | null) {
  const fmt = (d?: string | null) =>
    d ? new Date(d).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : null
  const s = fmt(start)
  const e = fmt(end)
  if (!s && !e) return null
  return [s, e].filter(Boolean).join(' – ')
}

interface Props {
  educations: Education[]
}

export function EducationSection({ educations }: Props) {
  const qc = useQueryClient()
  const [modal, setModal] = useState<{ open: boolean; editing?: Education }>({ open: false })

  const toForm = (edu: Education): FormState => ({
    institution: edu.institution,
    degree: edu.degree ?? '',
    field: edu.field ?? '',
    start_date: edu.start_date ?? '',
    end_date: edu.end_date ?? '',
    grade: edu.grade ?? '',
    activities: edu.activities.join('\n'),
    sort_order: edu.sort_order,
  })

  const toPayload = (f: FormState) => ({
    institution: f.institution,
    degree: f.degree || null,
    field: f.field || null,
    start_date: f.start_date || null,
    end_date: f.end_date || null,
    grade: f.grade || null,
    activities: f.activities.split('\n').map((a) => a.trim()).filter(Boolean),
    sort_order: f.sort_order,
  })

  const create = useMutation({
    mutationFn: (f: FormState) => api.profile.education.create(toPayload(f) as Parameters<typeof api.profile.education.create>[0]),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profile-education'] })
      setModal({ open: false })
    },
  })

  const update = useMutation({
    mutationFn: ({ id, f }: { id: string; f: FormState }) =>
      api.profile.education.update(id, toPayload(f) as Parameters<typeof api.profile.education.update>[1]),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profile-education'] })
      setModal({ open: false })
    },
  })

  const del = useMutation({
    mutationFn: (id: string) => api.profile.education.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profile-education'] }),
  })

  const saving = create.isPending || update.isPending

  const emptyForm: FormState = {
    institution: '',
    degree: '',
    field: '',
    start_date: '',
    end_date: '',
    grade: '',
    activities: '',
    sort_order: 0,
  }

  return (
    <section id="education" className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-[14px] font-semibold text-[var(--color-text)]">Education</h2>
          {educations.length > 0 && (
            <span className="text-[11px] text-[var(--color-faint)] tabular">{educations.length}</span>
          )}
        </div>
        <button
          onClick={() => setModal({ open: true })}
          className="flex items-center gap-1.5 h-7 px-3 rounded-sm text-[12px] font-medium bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg)] transition-colors"
        >
          <Plus size={12} strokeWidth={2} />
          Add
        </button>
      </div>

      {educations.length === 0 && (
        <div
          className="rounded-md border border-dashed border-[var(--color-border)] p-6 text-center cursor-pointer hover:bg-[var(--color-surface)] transition-colors"
          onClick={() => setModal({ open: true })}
        >
          <p className="text-[12px] text-[var(--color-faint)]">Add your academic background</p>
          <p className="text-[11px] text-[var(--color-faint)] mt-1">Click to add →</p>
        </div>
      )}

      {educations.map((edu) => (
        <div
          key={edu.id}
          className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md p-4 group"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-sm bg-[var(--color-surface-sunken)] flex items-center justify-center shrink-0 mt-0.5">
                <GraduationCap size={14} strokeWidth={1.5} className="text-[var(--color-muted)]" />
              </div>
              <div>
                <p className="text-[13px] font-semibold text-[var(--color-text)]">{edu.institution}</p>
                {(edu.degree || edu.field) && (
                  <p className="text-[12px] text-[var(--color-muted)]">
                    {[edu.degree, edu.field].filter(Boolean).join(' · ')}
                  </p>
                )}
                <div className="flex items-center gap-3 mt-0.5">
                  {formatDateRange(edu.start_date, edu.end_date) && (
                    <p className="text-[11px] text-[var(--color-faint)]">
                      {formatDateRange(edu.start_date, edu.end_date)}
                    </p>
                  )}
                  {edu.grade && (
                    <p className="text-[11px] text-[var(--color-faint)]">GPA: {edu.grade}</p>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <button
                onClick={() => setModal({ open: true, editing: edu })}
                className="p-1.5 rounded-sm text-[var(--color-faint)] hover:text-[var(--color-muted)] hover:bg-[var(--color-surface-sunken)]"
              >
                <Pencil size={12} strokeWidth={1.5} />
              </button>
              <button
                onClick={() => del.mutate(edu.id)}
                disabled={del.isPending}
                className="p-1.5 rounded-sm text-[var(--color-faint)] hover:text-red-500 hover:bg-red-50 disabled:opacity-40"
              >
                <Trash2 size={12} strokeWidth={1.5} />
              </button>
            </div>
          </div>

          {edu.activities.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-3 pl-11">
              {edu.activities.map((a, i) => (
                <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-surface-sunken)] text-[var(--color-faint)]">
                  {a}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}

      {modal.open && (
        <EducationModal
          initial={modal.editing ? toForm(modal.editing) : emptyForm}
          onClose={() => setModal({ open: false })}
          onSave={(f) =>
            modal.editing
              ? update.mutate({ id: modal.editing.id, f })
              : create.mutate(f)
          }
          saving={saving}
        />
      )}
    </section>
  )
}
