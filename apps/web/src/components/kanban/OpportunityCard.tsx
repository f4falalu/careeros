'use client'
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, Wand2, FileText, ChevronDown, X, Copy, Check, Layers, Mail, Mic, Send } from 'lucide-react'
import { api } from '@/lib/api'
import { formatRelative, titleCase } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { Opportunity, Application, PipelineStage, CoverLetter } from '@/types'

const STAGES: PipelineStage[] = [
  'saved', 'applied', 'assessment', 'interview', 'final', 'offer', 'rejected', 'withdrawn',
]

function CoverLetterModal({
  letters,
  onClose,
}: {
  letters: CoverLetter[]
  onClose: () => void
}) {
  const [selected, setSelected] = useState(0)
  const [copied, setCopied] = useState(false)
  const letter = letters[selected]

  const copy = async () => {
    await navigator.clipboard.writeText(letter.body)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md shadow-panel w-[640px] max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-3">
            <h3 className="text-[14px] font-semibold text-[var(--color-text)]">Cover Letter</h3>
            {letters.length > 1 && (
              <select
                value={selected}
                onChange={(e) => setSelected(Number(e.target.value))}
                className="text-[11px] text-[var(--color-muted)] bg-[var(--color-surface-sunken)] border border-[var(--color-border)] rounded px-2 py-0.5"
              >
                {letters.map((l, i) => (
                  <option key={l.id} value={i}>
                    {l.tone ?? 'default'} · {new Date(l.created_at).toLocaleDateString()}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={copy}
              className="flex items-center gap-1 h-7 px-2.5 rounded-sm text-[11px] font-medium bg-[var(--color-surface-sunken)] text-[var(--color-muted)] hover:bg-[var(--color-border)] transition-colors"
            >
              {copied ? <Check size={11} strokeWidth={1.5} /> : <Copy size={11} strokeWidth={1.5} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button onClick={onClose} className="text-[var(--color-faint)] hover:text-[var(--color-muted)]">
              <X size={16} strokeWidth={1.5} />
            </button>
          </div>
        </div>
        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <pre className="text-[12px] text-[var(--color-text)] font-sans leading-relaxed whitespace-pre-wrap">
            {letter?.body ?? ''}
          </pre>
        </div>
      </div>
    </div>
  )
}

interface Props {
  opportunity: Opportunity
  application?: Application
}

export function OpportunityCard({ opportunity, application }: Props) {
  const qc = useQueryClient()
  const [stageOpen, setStageOpen] = useState(false)
  const [coverOpen, setCoverOpen] = useState(false)

  const { data: coverLetters = [] } = useQuery({
    queryKey: ['cover-letters', opportunity.id],
    queryFn: () => api.coverLetters.listByOpportunity(opportunity.id),
    enabled: coverOpen,
    staleTime: 30_000,
  })

  const createApp = useMutation({
    mutationFn: () => api.applications.create(opportunity.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['applications'] })
      qc.invalidateQueries({ queryKey: ['kanban'] })
    },
  })

  const moveStage = useMutation({
    mutationFn: (to: PipelineStage) =>
      api.applications.moveStage(application!.id, to),
    onSuccess: () => {
      setStageOpen(false)
      qc.invalidateQueries({ queryKey: ['kanban'] })
    },
  })

  const genResume = useMutation({
    mutationFn: () => api.opportunities.resume(opportunity.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  })

  const genCover = useMutation({
    mutationFn: () => api.opportunities.coverLetter(opportunity.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ['cover-letters', opportunity.id] })
      }, 3000)
    },
  })

  const genVvp = useMutation({
    mutationFn: () => api.vvp.propose(opportunity.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  })

  const genOutreach = useMutation({
    mutationFn: () => api.outreach.draft(opportunity.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  })

  const genInterviewBrief = useMutation({
    mutationFn: () => {
      if (!application) throw new Error('No application')
      return api.interviews.generateBrief(application.id)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks', 'interviews'] }),
  })

  // Phase 4 (gated): auto-apply. The agent enforces Settings → Autonomy; if it's
  // off / unconfirmed / over limit, the task surfaces the reason in the task feed.
  const autoApply = useMutation({
    mutationFn: () => api.opportunities.apply(opportunity.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  })

  const interviewStages: typeof application['stage'][] = ['interview', 'final', 'offer']
  const showInterviewBtn = application && interviewStages.includes(application.stage)

  return (
    <>
      {coverOpen && coverLetters.length > 0 && (
        <CoverLetterModal letters={coverLetters} onClose={() => setCoverOpen(false)} />
      )}

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md p-4 hover-lift group">
        {/* Title row */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <p className="text-[13px] font-semibold text-[var(--color-text)] leading-snug">
            {opportunity.role_title}
          </p>
          {opportunity.source_url && (
            <a
              href={opportunity.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-[var(--color-faint)] hover:text-[var(--color-muted)] transition-colors mt-0.5"
            >
              <ExternalLink size={12} strokeWidth={1.5} />
            </a>
          )}
        </div>

        {/* Meta chips */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {opportunity.work_model && opportunity.work_model !== 'unknown' && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-pill bg-[var(--color-surface-sunken)] text-[var(--color-muted)]">
              {titleCase(opportunity.work_model)}
            </span>
          )}
          {opportunity.seniority && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-pill bg-[var(--color-surface-sunken)] text-[var(--color-muted)]">
              {opportunity.seniority}
            </span>
          )}
          {opportunity.salary_text && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-pill bg-[var(--color-surface-sunken)] text-[var(--color-muted)] tabular">
              {opportunity.salary_text}
            </span>
          )}
        </div>

        {/* Required skills */}
        {opportunity.required_skills?.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {opportunity.required_skills.slice(0, 5).map((s) => (
              <span key={s} className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-surface-sunken)] text-[var(--color-faint)]">
                {s}
              </span>
            ))}
            {opportunity.required_skills.length > 5 && (
              <span className="text-[10px] text-[var(--color-faint)]">
                +{opportunity.required_skills.length - 5}
              </span>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-[var(--color-faint)] tabular">
            {formatRelative(opportunity.created_at)}
          </span>
          <div className="flex items-center gap-1.5">
            {/* Generate resume */}
            <button
              title="Generate tailored resume"
              onClick={() => genResume.mutate()}
              disabled={genResume.isPending}
              className="p-1 rounded text-[var(--color-faint)] hover:text-[var(--color-muted)] hover:bg-[var(--color-surface-sunken)] transition-colors disabled:opacity-40"
            >
              <FileText size={13} strokeWidth={1.5} />
            </button>

            {/* Cover letter: generate or view */}
            <button
              title={coverLetters.length > 0 ? 'View cover letter' : 'Generate cover letter'}
              onClick={() => {
                if (coverLetters.length > 0) {
                  setCoverOpen(true)
                } else {
                  genCover.mutate()
                  // Pre-fetch after a delay so clicking next time opens it
                  qc.invalidateQueries({ queryKey: ['cover-letters', opportunity.id] })
                }
              }}
              disabled={genCover.isPending}
              className="p-1 rounded text-[var(--color-faint)] hover:text-[var(--color-muted)] hover:bg-[var(--color-surface-sunken)] transition-colors disabled:opacity-40"
            >
              <Wand2 size={13} strokeWidth={1.5} />
            </button>

            {/* Build VVP */}
            <button
              title="Build Value Validation Project"
              onClick={() => genVvp.mutate()}
              disabled={genVvp.isPending}
              className="p-1 rounded text-[var(--color-faint)] hover:text-[var(--color-muted)] hover:bg-[var(--color-surface-sunken)] transition-colors disabled:opacity-40"
            >
              <Layers size={13} strokeWidth={1.5} />
            </button>

            {/* Draft outreach */}
            <button
              title="Draft outreach message"
              onClick={() => genOutreach.mutate()}
              disabled={genOutreach.isPending}
              className="p-1 rounded text-[var(--color-faint)] hover:text-[var(--color-muted)] hover:bg-[var(--color-surface-sunken)] transition-colors disabled:opacity-40"
            >
              <Mail size={13} strokeWidth={1.5} />
            </button>

            {/* Auto-apply (gated by Settings → Autonomy) */}
            <button
              title="Auto-apply (uses your autonomy settings)"
              onClick={() => autoApply.mutate()}
              disabled={autoApply.isPending}
              className="p-1 rounded text-[var(--color-faint)] hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
            >
              <Send size={13} strokeWidth={1.5} />
            </button>

            {/* Interview prep — only visible at interview/final/offer stage */}
            {showInterviewBtn && (
              <button
                title="Generate interview brief"
                onClick={() => genInterviewBrief.mutate()}
                disabled={genInterviewBrief.isPending}
                className="p-1 rounded text-purple-500 hover:text-purple-700 hover:bg-purple-50 transition-colors disabled:opacity-40"
              >
                <Mic size={13} strokeWidth={1.5} />
              </button>
            )}

            {/* Stage control */}
            {application ? (
              <div className="relative">
                <button
                  onClick={() => setStageOpen((o) => !o)}
                  className={cn(
                    `stage-${application.stage}`,
                    'flex items-center gap-0.5 text-[10px] font-medium px-2 py-0.5 rounded-pill',
                  )}
                >
                  {titleCase(application.stage)}
                  <ChevronDown size={10} />
                </button>
                {stageOpen && (
                  <div className="absolute right-0 top-full mt-1 z-20 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md shadow-panel min-w-[130px] py-1">
                    {STAGES.map((s) => (
                      <button
                        key={s}
                        onClick={() => moveStage.mutate(s)}
                        disabled={s === application.stage || moveStage.isPending}
                        className="w-full text-left px-3 py-1.5 text-[12px] text-[var(--color-text)] hover:bg-[var(--color-bg)] disabled:opacity-40 disabled:cursor-default"
                      >
                        {titleCase(s)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => createApp.mutate()}
                disabled={createApp.isPending}
                className="text-[10px] font-medium px-2 py-0.5 rounded-pill bg-[var(--color-text)] text-[var(--color-bg)] hover:opacity-80 transition-opacity disabled:opacity-40"
              >
                Track
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
