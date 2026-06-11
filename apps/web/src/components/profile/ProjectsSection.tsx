'use client'
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, FolderOpen, ExternalLink, X } from 'lucide-react'
import { api } from '@/lib/api'
import type { ProfileProject } from '@/types'

type FormState = {
  title: string
  description: string
  role: string
  tools: string
  outcome: string
  links: string
  sort_order: number
}

const EMPTY: FormState = {
  title: '',
  description: '',
  role: '',
  tools: '',
  outcome: '',
  links: '',
  sort_order: 0,
}

function ProjectModal({
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
        className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md shadow-panel w-[560px] max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
          <h3 className="text-[14px] font-semibold text-[var(--color-text)]">
            {initial.title ? 'Edit Project' : 'Add Project'}
          </h3>
          <button onClick={onClose} className="text-[var(--color-faint)] hover:text-[var(--color-muted)]">
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-[11px] font-medium text-[var(--color-muted)] mb-1">
                Project Title <span className="text-red-400">*</span>
              </label>
              <input
                className="field-input w-full"
                placeholder="AI Therapist Companion"
                value={form.title}
                onChange={(e) => set('title', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[var(--color-muted)] mb-1">Your Role</label>
              <input
                className="field-input w-full"
                placeholder="Product Manager, Founder…"
                value={form.role}
                onChange={(e) => set('role', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[var(--color-muted)] mb-1">
                Tools (comma-separated)
              </label>
              <input
                className="field-input w-full"
                placeholder="Python, OpenAI, Supabase"
                value={form.tools}
                onChange={(e) => set('tools', e.target.value)}
              />
            </div>
            <div className="col-span-2">
              <label className="block text-[11px] font-medium text-[var(--color-muted)] mb-1">Description</label>
              <textarea
                rows={3}
                className="field-input w-full resize-none"
                placeholder="What did you build and why?"
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
              />
            </div>
            <div className="col-span-2">
              <label className="block text-[11px] font-medium text-[var(--color-muted)] mb-1">Outcome / Impact</label>
              <input
                className="field-input w-full"
                placeholder="Validated with 50+ users, shipped MVP in 3 months"
                value={form.outcome}
                onChange={(e) => set('outcome', e.target.value)}
              />
            </div>
            <div className="col-span-2">
              <label className="block text-[11px] font-medium text-[var(--color-muted)] mb-1">
                Links (one per line)
              </label>
              <textarea
                rows={2}
                className="field-input w-full resize-none"
                placeholder="https://github.com/…&#10;https://demo.example.com"
                value={form.links}
                onChange={(e) => set('links', e.target.value)}
              />
            </div>
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
            disabled={saving || !form.title}
            className="h-8 px-4 rounded-sm text-[12px] font-medium bg-[var(--color-text)] text-[var(--color-bg)] hover:opacity-80 disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

interface Props {
  projects: ProfileProject[]
}

export function ProjectsSection({ projects }: Props) {
  const qc = useQueryClient()
  const [modal, setModal] = useState<{ open: boolean; editing?: ProfileProject }>({ open: false })

  const toForm = (p: ProfileProject): FormState => ({
    title: p.title,
    description: p.description ?? '',
    role: p.role ?? '',
    tools: p.tools.join(', '),
    outcome: p.outcome ?? '',
    links: p.links.join('\n'),
    sort_order: p.sort_order,
  })

  const toPayload = (f: FormState) => ({
    title: f.title,
    description: f.description || null,
    role: f.role || null,
    tools: f.tools.split(',').map((t) => t.trim()).filter(Boolean),
    outcome: f.outcome || null,
    links: f.links.split('\n').map((l) => l.trim()).filter(Boolean),
    sort_order: f.sort_order,
  })

  const create = useMutation({
    mutationFn: (f: FormState) =>
      api.profile.projects.create(toPayload(f) as Parameters<typeof api.profile.projects.create>[0]),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profile-projects'] })
      setModal({ open: false })
    },
  })

  const update = useMutation({
    mutationFn: ({ id, f }: { id: string; f: FormState }) =>
      api.profile.projects.update(id, toPayload(f) as Parameters<typeof api.profile.projects.update>[1]),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profile-projects'] })
      setModal({ open: false })
    },
  })

  const del = useMutation({
    mutationFn: (id: string) => api.profile.projects.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profile-projects'] }),
  })

  return (
    <section id="projects" className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-[14px] font-semibold text-[var(--color-text)]">Projects</h2>
          {projects.length > 0 && (
            <span className="text-[11px] text-[var(--color-faint)] tabular">{projects.length}</span>
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

      {projects.length === 0 && (
        <div
          className="rounded-md border border-dashed border-[var(--color-border)] p-6 text-center cursor-pointer hover:bg-[var(--color-surface)] transition-colors"
          onClick={() => setModal({ open: true })}
        >
          <p className="text-[12px] text-[var(--color-faint)]">
            Showcase side projects, research, or products you've built
          </p>
          <p className="text-[11px] text-[var(--color-faint)] mt-1">Click to add →</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {projects.map((project) => (
          <div
            key={project.id}
            className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md p-4 group"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2.5">
                <FolderOpen size={14} strokeWidth={1.5} className="text-[var(--color-muted)] shrink-0 mt-0.5" />
                <div>
                  <p className="text-[13px] font-semibold text-[var(--color-text)]">{project.title}</p>
                  {project.role && (
                    <p className="text-[11px] text-[var(--color-faint)]">{project.role}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <button
                  onClick={() => setModal({ open: true, editing: project })}
                  className="p-1.5 rounded-sm text-[var(--color-faint)] hover:text-[var(--color-muted)] hover:bg-[var(--color-surface-sunken)]"
                >
                  <Pencil size={11} strokeWidth={1.5} />
                </button>
                <button
                  onClick={() => del.mutate(project.id)}
                  disabled={del.isPending}
                  className="p-1.5 rounded-sm text-[var(--color-faint)] hover:text-red-500 hover:bg-red-50 disabled:opacity-40"
                >
                  <Trash2 size={11} strokeWidth={1.5} />
                </button>
              </div>
            </div>

            {project.description && (
              <p className="mt-2 text-[12px] text-[var(--color-muted)] leading-relaxed line-clamp-2">
                {project.description}
              </p>
            )}

            {project.outcome && (
              <p className="mt-1.5 text-[11px] text-emerald-600 font-medium">{project.outcome}</p>
            )}

            {project.tools.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {project.tools.map((t) => (
                  <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-surface-sunken)] text-[var(--color-faint)]">
                    {t}
                  </span>
                ))}
              </div>
            )}

            {project.links.length > 0 && (
              <div className="flex gap-2 mt-2">
                {project.links.map((link, i) => (
                  <a
                    key={i}
                    href={link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[10px] text-[var(--color-muted)] hover:text-[var(--color-text)]"
                  >
                    <ExternalLink size={10} strokeWidth={1.5} />
                    Link {project.links.length > 1 ? i + 1 : ''}
                  </a>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {modal.open && (
        <ProjectModal
          initial={modal.editing ? toForm(modal.editing) : EMPTY}
          onClose={() => setModal({ open: false })}
          onSave={(f) =>
            modal.editing
              ? update.mutate({ id: modal.editing.id, f })
              : create.mutate(f)
          }
          saving={create.isPending || update.isPending}
        />
      )}
    </section>
  )
}
