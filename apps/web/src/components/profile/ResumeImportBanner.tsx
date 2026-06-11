'use client'
import { useRef, useState, useCallback, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Upload, FileText, CheckCircle, X, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import { api } from '@/lib/api'
import type { AgentTask } from '@/types'

type Phase =
  | { name: 'idle' }
  | { name: 'uploading' }
  | { name: 'parsing'; taskId: string }
  | { name: 'preview'; taskId: string; parsed: ParsedPreview }
  | { name: 'done'; counts: ApplyCounts }

interface ParsedPreview {
  headline?: string | null
  bio?: string | null
  work_experiences?: Array<{ company_name: string; title: string }>
  education?: Array<{ institution: string; degree?: string | null }>
  skills?: Array<{ name: string }>
  projects?: Array<{ title: string }>
}

interface ApplyCounts {
  workExperiences: number
  education: number
  skills: number
  projects: number
}

export function ResumeImportBanner() {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [phase, setPhase] = useState<Phase>({ name: 'idle' })
  const [expanded, setExpanded] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  // Poll the agent task while parsing
  const taskId = phase.name === 'parsing' ? phase.taskId : null
  const { data: taskData } = useQuery<AgentTask>({
    queryKey: ['resume-parse-task', taskId],
    queryFn: () => api.tasks.get(taskId!),
    enabled: !!taskId,
    refetchInterval: (query) => {
      const status = (query.state.data as AgentTask | undefined)?.status
      if (status === 'succeeded' || status === 'failed' || status === 'cancelled') return false
      return 2000
    },
  })

  useEffect(() => {
    if (!taskData || phase.name !== 'parsing') return
    if (taskData.status === 'succeeded') {
      setPhase({
        name: 'preview',
        taskId: phase.taskId,
        parsed: (taskData.output ?? {}) as ParsedPreview,
      })
    } else if (taskData.status === 'failed') {
      setPhase({ name: 'idle' })
      // Using console.error instead of alert for better UX in production
      console.error('Resume parsing failed:', taskData.error)
    }
  }, [taskData, phase])

  const upload = useMutation({
    mutationFn: (file: File) => api.resumeImport.upload(file),
    onMutate: () => setPhase({ name: 'uploading' }),
    onSuccess: ({ taskId }) => setPhase({ name: 'parsing', taskId }),
    onError: (err: Error) => {
      setPhase({ name: 'idle' })
      alert(`Upload failed: ${err.message}`)
    },
  })

  const apply = useMutation({
    mutationFn: (taskId: string) => api.resumeImport.apply(taskId),
    onSuccess: ({ counts }) => {
      setPhase({ name: 'done', counts })
      // Refresh all profile sections
      qc.invalidateQueries({ queryKey: ['profile'] })
      qc.invalidateQueries({ queryKey: ['profile-work'] })
      qc.invalidateQueries({ queryKey: ['profile-education'] })
      qc.invalidateQueries({ queryKey: ['profile-skills'] })
      qc.invalidateQueries({ queryKey: ['profile-projects'] })
    },
    onError: (err: Error) => alert(`Apply failed: ${err.message}`),
  })

  const handleFile = useCallback((file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      alert('Only PDF files are accepted')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('File must be under 5 MB')
      return
    }
    upload.mutate(file)
  }, [upload])

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  // ── Done state ────────────────────────────────────────────────
  if (phase.name === 'done') {
    const { counts } = phase
    const total = counts.workExperiences + counts.education + counts.skills + counts.projects
    return (
      <div className="flex items-center justify-between bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md px-4 py-3">
        <div className="flex items-center gap-2.5">
          <CheckCircle size={15} strokeWidth={1.5} className="text-emerald-500 shrink-0" />
          <span className="text-[13px] text-[var(--color-text)]">
            Resume imported —{' '}
            <span className="text-[var(--color-muted)]">
              {counts.workExperiences} roles, {counts.education} education, {counts.skills} skills
              {counts.projects > 0 ? `, ${counts.projects} projects` : ''}
            </span>
          </span>
        </div>
        <button
          onClick={() => setPhase({ name: 'idle' })}
          className="p-1 text-[var(--color-faint)] hover:text-[var(--color-muted)]"
          aria-label="Dismiss"
        >
          <X size={13} strokeWidth={1.5} />
        </button>
      </div>
    )
  }

  // ── Preview state ─────────────────────────────────────────────
  if (phase.name === 'preview') {
    const { parsed, taskId: tid } = phase
    const workCount = parsed.work_experiences?.length ?? 0
    const eduCount = parsed.education?.length ?? 0
    const skillCount = parsed.skills?.length ?? 0
    const projectCount = parsed.projects?.length ?? 0

    return (
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2.5">
            <FileText size={14} strokeWidth={1.5} className="text-[var(--color-muted)] shrink-0" />
            <span className="text-[13px] font-medium text-[var(--color-text)]">Resume parsed</span>
            <span className="text-[12px] text-[var(--color-muted)]">
              — {workCount} roles · {eduCount} education · {skillCount} skills
              {projectCount > 0 ? ` · ${projectCount} projects` : ''}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setExpanded((v) => !v)}
              className="flex items-center gap-1 text-[11px] text-[var(--color-muted)] hover:text-[var(--color-text)] px-2 py-1 rounded-sm hover:bg-[var(--color-surface-sunken)]"
            >
              {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {expanded ? 'Hide' : 'Preview'}
            </button>
            <button
              onClick={() => setPhase({ name: 'idle' })}
              className="p-1 text-[var(--color-faint)] hover:text-[var(--color-muted)]"
              aria-label="Discard"
            >
              <X size={13} strokeWidth={1.5} />
            </button>
          </div>
        </div>

        {/* Expandable preview */}
        {expanded && (
          <div className="px-4 py-3 space-y-3 border-b border-[var(--color-border)]">
            {parsed.headline && (
              <p className="text-[12px] font-medium text-[var(--color-text)]">{parsed.headline}</p>
            )}
            {parsed.bio && (
              <p className="text-[12px] text-[var(--color-muted)] leading-relaxed">{parsed.bio}</p>
            )}

            {workCount > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-faint)] mb-1.5">
                  Work Experience
                </p>
                <div className="space-y-1">
                  {parsed.work_experiences!.map((w, i) => (
                    <div key={i} className="text-[12px] text-[var(--color-muted)]">
                      <span className="font-medium text-[var(--color-text)]">{w.title}</span>
                      {' at '}
                      {w.company_name}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {eduCount > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-faint)] mb-1.5">
                  Education
                </p>
                <div className="space-y-1">
                  {parsed.education!.map((e, i) => (
                    <div key={i} className="text-[12px] text-[var(--color-muted)]">
                      <span className="font-medium text-[var(--color-text)]">{e.institution}</span>
                      {e.degree ? ` — ${e.degree}` : ''}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {skillCount > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-faint)] mb-1.5">
                  Skills
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {parsed.skills!.slice(0, 20).map((s, i) => (
                    <span
                      key={i}
                      className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--color-surface-sunken)] text-[var(--color-muted)]"
                    >
                      {s.name}
                    </span>
                  ))}
                  {skillCount > 20 && (
                    <span className="text-[11px] text-[var(--color-faint)]">
                      +{skillCount - 20} more
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Apply footer */}
        <div className="px-4 py-3 flex items-center justify-between">
          <p className="text-[12px] text-[var(--color-muted)]">
            Review the data above, then apply to fill your profile. You can edit anything after.
          </p>
          <button
            onClick={() => apply.mutate(tid)}
            disabled={apply.isPending}
            className="flex items-center gap-1.5 h-8 px-4 rounded-sm text-[12px] font-medium bg-[var(--color-text)] text-[var(--color-bg)] hover:opacity-80 disabled:opacity-40 shrink-0 ml-4"
          >
            {apply.isPending && <Loader2 size={12} strokeWidth={2} className="animate-spin" />}
            Apply to profile
          </button>
        </div>
      </div>
    )
  }

  // ── Uploading / Parsing states ────────────────────────────────
  if (phase.name === 'uploading' || phase.name === 'parsing') {
    return (
      <div className="flex items-center gap-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md px-4 py-3">
        <Loader2 size={14} strokeWidth={1.5} className="animate-spin text-[var(--color-muted)] shrink-0" />
        <span className="text-[13px] text-[var(--color-muted)]">
          {phase.name === 'uploading' ? 'Uploading resume…' : 'AI is reading your resume…'}
        </span>
      </div>
    )
  }

  // ── Idle state ────────────────────────────────────────────────
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      className={[
        'flex items-center justify-between bg-[var(--color-surface)] border rounded-md px-4 py-3 transition-colors',
        dragOver
          ? 'border-[var(--color-text)] bg-[var(--color-surface-sunken)]'
          : 'border-[var(--color-border)] border-dashed',
      ].join(' ')}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <Upload size={14} strokeWidth={1.5} className="text-[var(--color-faint)] shrink-0" />
        <span className="text-[13px] text-[var(--color-muted)] truncate">
          {dragOver ? 'Drop your PDF here' : 'Import from resume — AI will pre-fill your profile'}
        </span>
      </div>
      <button
        onClick={() => fileRef.current?.click()}
        className="shrink-0 ml-4 h-7 px-3 rounded-sm text-[12px] font-medium border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-text)] transition-colors"
      >
        Upload PDF
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={onInputChange}
      />
    </div>
  )
}
