'use client'
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, Briefcase, Check, X } from 'lucide-react'
import { api } from '@/lib/api'
import type { WorkExperience } from '@/types'

const EMPTY_FORM = {
  company_name: '',
  title: '',
  employment_type: '',
  start_date: '',
  end_date: '',
  is_current: false,
  location: '',
  bullets: '',
  skills_extracted: '',
  sort_order: 0,
}

type FormState = typeof EMPTY_FORM

function WorkExpModal({
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
  const set = (k: keyof FormState, v: string | boolean | number) =>
    setForm((f) => ({ ...f, [k]: v }))

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md shadow-panel w-[600px] max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
          <h3 className="text-[14px] font-semibold text-[var(--color-text)]">
            {initial.company_name ? 'Edit Experience' : 'Add Experience'}
          </h3>
          <button onClick={onClose} className="text-[var(--color-faint)] hover:text-[var(--color-muted)]">
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Company" required>
              <input
                className="field-input"
                placeholder="Acme Corp"
                value={form.company_name}
                onChange={(e) => set('company_name', e.target.value)}
              />
            </Field>
            <Field label="Job Title" required>
              <input
                className="field-input"
                placeholder="Product Manager"
                value={form.title}
                onChange={(e) => set('title', e.target.value)}
              />
            </Field>
            <Field label="Employment Type">
              <select
                className="field-input"
                value={form.employment_type}
                onChange={(e) => set('employment_type', e.target.value)}
              >
                <option value="">Select…</option>
                <option value="Full-time">Full-time</option>
                <option value="Part-time">Part-time</option>
                <option value="Contract">Contract</option>
                <option value="Freelance">Freelance</option>
                <option value="Internship">Internship</option>
              </select>
            </Field>
            <Field label="Location">
              <input
                className="field-input"
                placeholder="Lagos, Nigeria / Remote"
                value={form.location}
                onChange={(e) => set('location', e.target.value)}
              />
            </Field>
            <Field label="Start Date">
              <input
                type="month"
                className="field-input"
                value={form.start_date?.slice(0, 7) ?? ''}
                onChange={(e) => set('start_date', e.target.value ? `${e.target.value}-01` : '')}
              />
            </Field>
            <Field label="End Date">
              <div className="space-y-1.5">
                <input
                  type="month"
                  className="field-input"
                  disabled={form.is_current}
                  value={form.is_current ? '' : (form.end_date?.slice(0, 7) ?? '')}
                  onChange={(e) => set('end_date', e.target.value ? `${e.target.value}-01` : '')}
                />
                <label className="flex items-center gap-2 text-[11px] text-[var(--color-muted)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_current}
                    onChange={(e) => {
                      set('is_current', e.target.checked)
                      if (e.target.checked) set('end_date', '')
                    }}
                    className="rounded"
                  />
                  Currently working here
                </label>
              </div>
            </Field>
          </div>

          <Field label="Responsibilities & Achievements" hint="One bullet per line. Lead with a strong action verb.">
            <textarea
              rows={5}
              className="field-input resize-none"
              placeholder="Led AI transformation across 3 business units, reducing manual work by 40%&#10;Managed cross-functional team of 8 engineers and designers"
              value={form.bullets}
              onChange={(e) => set('bullets', e.target.value)}
            />
          </Field>

          <Field label="Skills (comma-separated)" hint="These are extracted for matching">
            <input
              className="field-input"
              placeholder="Product Strategy, SQL, Stakeholder Management"
              value={form.skills_extracted}
              onChange={(e) => set('skills_extracted', e.target.value)}
            />
          </Field>
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
            disabled={saving || !form.company_name || !form.title}
            className="h-8 px-4 rounded-sm text-[12px] font-medium bg-[var(--color-text)] text-[var(--color-bg)] hover:opacity-80 disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string
  required?: boolean
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-[var(--color-muted)] mb-1">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-[10px] text-[var(--color-faint)]">{hint}</p>}
    </div>
  )
}

function formatDateRange(start?: string | null, end?: string | null, isCurrent?: boolean) {
  const fmt = (d?: string | null) => {
    if (!d) return null
    return new Date(d).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  }
  const s = fmt(start)
  const e = isCurrent ? 'Present' : fmt(end)
  if (!s && !e) return null
  if (!s) return e
  if (!e) return s
  return `${s} – ${e}`
}

interface Props {
  experiences: WorkExperience[]
}

export function WorkExperienceSection({ experiences }: Props) {
  const qc = useQueryClient()
  const [modal, setModal] = useState<{ open: boolean; editing?: WorkExperience }>({ open: false })

  const formFromExp = (exp: WorkExperience): FormState => ({
    company_name: exp.company_name,
    title: exp.title,
    employment_type: exp.employment_type ?? '',
    start_date: exp.start_date ?? '',
    end_date: exp.end_date ?? '',
    is_current: exp.is_current,
    location: exp.location ?? '',
    bullets: exp.bullets.join('\n'),
    skills_extracted: exp.skills_extracted.join(', '),
    sort_order: exp.sort_order,
  })

  const formToPayload = (f: FormState) => ({
    company_name: f.company_name,
    title: f.title,
    employment_type: f.employment_type || undefined,
    start_date: f.start_date || undefined,
    end_date: f.is_current ? undefined : (f.end_date || undefined),
    is_current: f.is_current,
    location: f.location || undefined,
    bullets: f.bullets.split('\n').map((b) => b.trim()).filter(Boolean),
    skills_extracted: f.skills_extracted.split(',').map((s) => s.trim()).filter(Boolean),
    sort_order: f.sort_order,
  })

  const create = useMutation({
    mutationFn: (f: FormState) => api.profile.workExperiences.create(formToPayload(f) as Parameters<typeof api.profile.workExperiences.create>[0]),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profile-work'] })
      setModal({ open: false })
    },
  })

  const update = useMutation({
    mutationFn: ({ id, f }: { id: string; f: FormState }) =>
      api.profile.workExperiences.update(id, formToPayload(f) as Parameters<typeof api.profile.workExperiences.update>[1]),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profile-work'] })
      setModal({ open: false })
    },
  })

  const del = useMutation({
    mutationFn: (id: string) => api.profile.workExperiences.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profile-work'] }),
  })

  const saving = create.isPending || update.isPending

  return (
    <section id="work" className="space-y-3">
      <SectionHeader
        title="Work Experience"
        count={experiences.length}
        onAdd={() => setModal({ open: true })}
      />

      {experiences.length === 0 && (
        <EmptyState
          message="Add your work history to power AI matching and resume generation"
          onAdd={() => setModal({ open: true })}
        />
      )}

      {experiences.map((exp) => (
        <div
          key={exp.id}
          className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md p-4 group"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-8 h-8 rounded-sm bg-[var(--color-surface-sunken)] flex items-center justify-center shrink-0 mt-0.5">
                <Briefcase size={14} strokeWidth={1.5} className="text-[var(--color-muted)]" />
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-[var(--color-text)]">{exp.title}</p>
                <p className="text-[12px] text-[var(--color-muted)]">
                  {exp.company_name}
                  {exp.employment_type && ` · ${exp.employment_type}`}
                  {exp.location && ` · ${exp.location}`}
                </p>
                {formatDateRange(exp.start_date, exp.end_date, exp.is_current) && (
                  <p className="text-[11px] text-[var(--color-faint)] mt-0.5">
                    {formatDateRange(exp.start_date, exp.end_date, exp.is_current)}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <button
                onClick={() => setModal({ open: true, editing: exp })}
                className="p-1.5 rounded-sm text-[var(--color-faint)] hover:text-[var(--color-muted)] hover:bg-[var(--color-surface-sunken)]"
              >
                <Pencil size={12} strokeWidth={1.5} />
              </button>
              <button
                onClick={() => del.mutate(exp.id)}
                disabled={del.isPending}
                className="p-1.5 rounded-sm text-[var(--color-faint)] hover:text-red-500 hover:bg-red-50 disabled:opacity-40"
              >
                <Trash2 size={12} strokeWidth={1.5} />
              </button>
            </div>
          </div>

          {exp.bullets.length > 0 && (
            <ul className="mt-3 space-y-1 pl-11">
              {exp.bullets.map((b, i) => (
                <li key={i} className="text-[12px] text-[var(--color-muted)] leading-relaxed flex gap-2">
                  <span className="text-[var(--color-faint)] mt-0.5 shrink-0">·</span>
                  {b}
                </li>
              ))}
            </ul>
          )}

          {exp.skills_extracted.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-3 pl-11">
              {exp.skills_extracted.map((s) => (
                <span
                  key={s}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-surface-sunken)] text-[var(--color-faint)]"
                >
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}

      {modal.open && (
        <WorkExpModal
          initial={modal.editing ? formFromExp(modal.editing) : EMPTY_FORM}
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

function SectionHeader({
  title,
  count,
  onAdd,
}: {
  title: string
  count: number
  onAdd: () => void
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <h2 className="text-[14px] font-semibold text-[var(--color-text)]">{title}</h2>
        {count > 0 && (
          <span className="text-[11px] font-medium text-[var(--color-faint)] tabular">{count}</span>
        )}
      </div>
      <button
        onClick={onAdd}
        className="flex items-center gap-1.5 h-7 px-3 rounded-sm text-[12px] font-medium bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg)] transition-colors"
      >
        <Plus size={12} strokeWidth={2} />
        Add
      </button>
    </div>
  )
}

function EmptyState({ message, onAdd }: { message: string; onAdd: () => void }) {
  return (
    <div
      className="rounded-md border border-dashed border-[var(--color-border)] p-6 text-center cursor-pointer hover:bg-[var(--color-surface)] transition-colors"
      onClick={onAdd}
    >
      <p className="text-[12px] text-[var(--color-faint)]">{message}</p>
      <p className="text-[11px] text-[var(--color-faint)] mt-1">Click to add →</p>
    </div>
  )
}
