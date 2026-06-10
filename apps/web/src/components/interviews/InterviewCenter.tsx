'use client'
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  MessageSquare,
  Mic,
  RefreshCw,
  Send,
  Sparkles,
} from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { Interview, MockSession, InterviewQuestion } from '@/types'

// ── Category badge ────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  behavioral: 'bg-blue-50 text-blue-700 border-blue-200',
  technical: 'bg-purple-50 text-purple-700 border-purple-200',
  situational: 'bg-amber-50 text-amber-700 border-amber-200',
  culture_fit: 'bg-green-50 text-green-700 border-green-200',
}

function CategoryBadge({ category }: { category: string }) {
  return (
    <span
      className={cn(
        'text-[10px] font-medium px-1.5 py-0.5 rounded border',
        CATEGORY_COLORS[category] ?? 'bg-[var(--color-surface-sunken)] text-[var(--color-muted)] border-[var(--color-border)]',
      )}
    >
      {category.replace('_', ' ')}
    </span>
  )
}

// ── Question card with expandable hint ───────────────────────

function QuestionCard({
  q,
  onPractice,
}: {
  q: InterviewQuestion
  onPractice: (question: string) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-[var(--color-border)] rounded-md overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[var(--color-bg)] transition-colors"
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {open ? (
            <ChevronDown size={13} strokeWidth={1.5} className="shrink-0 text-[var(--color-faint)]" />
          ) : (
            <ChevronRight size={13} strokeWidth={1.5} className="shrink-0 text-[var(--color-faint)]" />
          )}
          <span className="text-[13px] text-[var(--color-text)] truncate">{q.question}</span>
        </div>
        <CategoryBadge category={q.category} />
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 bg-[var(--color-bg)] border-t border-[var(--color-border)]">
          <p className="text-[12px] text-[var(--color-muted)] leading-relaxed mb-3">{q.hint}</p>
          <button
            onClick={() => onPractice(q.question)}
            className="flex items-center gap-1.5 h-7 px-3 rounded-sm text-[11px] font-medium bg-[var(--color-text)] text-[var(--color-bg)] hover:opacity-80 transition-opacity"
          >
            <Mic size={11} strokeWidth={1.5} />
            Practice this
          </button>
        </div>
      )}
    </div>
  )
}

// ── Mock Q&A panel ────────────────────────────────────────────

function MockPanel({ interview }: { interview: Interview }) {
  const qc = useQueryClient()
  const [question, setQuestion] = useState('')
  const [activeSession, setActiveSession] = useState<string | undefined>()
  const [lastAnswer, setLastAnswer] = useState<{
    ideal_answer: string
    coaching_tip: string
    follow_up_question?: string
  } | null>(null)

  const { data: sessions = [] } = useQuery({
    queryKey: ['mock-sessions', interview.id],
    queryFn: () => api.interviews.listSessions(interview.id),
    staleTime: 5_000,
  })

  const askMock = useMutation({
    mutationFn: () => api.interviews.mock(interview.id, question.trim(), activeSession),
    onSuccess: async (task) => {
      setQuestion('')
      // Poll for the task to complete (simple approach: wait then refetch)
      let attempts = 0
      const poll = async () => {
        await new Promise((r) => setTimeout(r, 2_000))
        const updated = await api.tasks.get(task.id)
        if (updated.status === 'succeeded' && updated.output) {
          const out = updated.output as { answer: { ideal_answer: string; coaching_tip: string; follow_up_question?: string } }
          setLastAnswer(out.answer)
          qc.invalidateQueries({ queryKey: ['mock-sessions', interview.id] })
        } else if (updated.status === 'queued' || updated.status === 'running') {
          if (attempts++ < 15) poll()
        }
      }
      poll()
    },
  })

  return (
    <div className="flex flex-col gap-4">
      {/* Ask a question */}
      <div className="flex gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && question.trim()) {
              e.preventDefault()
              askMock.mutate()
            }
          }}
          placeholder="Type an interview question to practice..."
          className="flex-1 h-9 px-3 rounded-sm border border-[var(--color-border)] bg-[var(--color-surface)] text-[13px] text-[var(--color-text)] placeholder:text-[var(--color-faint)] focus:outline-none focus:ring-1 focus:ring-[var(--color-text)]"
        />
        <button
          onClick={() => askMock.mutate()}
          disabled={!question.trim() || askMock.isPending}
          className="h-9 px-3 rounded-sm bg-[var(--color-text)] text-[var(--color-bg)] text-[12px] font-medium hover:opacity-80 disabled:opacity-40 transition-opacity flex items-center gap-1.5"
        >
          <Send size={12} strokeWidth={1.5} />
          {askMock.isPending ? 'Thinking...' : 'Ask'}
        </button>
      </div>

      {/* Latest answer */}
      {lastAnswer && (
        <div className="border border-[var(--color-border)] rounded-md overflow-hidden">
          <div className="px-4 py-3 bg-[var(--color-bg)] border-b border-[var(--color-border)]">
            <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-faint)]">Ideal Answer</p>
          </div>
          <div className="px-4 py-3 space-y-3">
            <p className="text-[13px] text-[var(--color-text)] leading-relaxed whitespace-pre-wrap">
              {lastAnswer.ideal_answer}
            </p>
            <div className="border-t border-[var(--color-border)] pt-3">
              <p className="text-[11px] font-medium text-[var(--color-muted)] mb-1">Coach tip</p>
              <p className="text-[12px] text-[var(--color-text)] leading-relaxed">{lastAnswer.coaching_tip}</p>
            </div>
            {lastAnswer.follow_up_question && (
              <div className="border-t border-[var(--color-border)] pt-3">
                <p className="text-[11px] font-medium text-[var(--color-muted)] mb-1">Likely follow-up</p>
                <button
                  onClick={() => setQuestion(lastAnswer.follow_up_question ?? '')}
                  className="text-[12px] text-[var(--color-text)] hover:underline text-left"
                >
                  {lastAnswer.follow_up_question}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Session history count */}
      {sessions.length > 0 && (
        <p className="text-[11px] text-[var(--color-faint)]">
          {sessions.reduce((acc, s) => acc + s.transcript.length, 0)} questions practiced across{' '}
          {sessions.length} session{sessions.length > 1 ? 's' : ''}
        </p>
      )}
    </div>
  )
}

// ── Interview detail panel ────────────────────────────────────

function InterviewDetail({ interview }: { interview: Interview }) {
  const [tab, setTab] = useState<'brief' | 'mock'>('brief')
  const brief = interview.brief

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex gap-1 px-5 pt-4 border-b border-[var(--color-border)]">
        {(['brief', 'mock'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium border-b-2 -mb-px transition-colors',
              tab === t
                ? 'border-[var(--color-text)] text-[var(--color-text)]'
                : 'border-transparent text-[var(--color-faint)] hover:text-[var(--color-muted)]',
            )}
          >
            {t === 'brief' ? <BookOpen size={12} strokeWidth={1.5} /> : <MessageSquare size={12} strokeWidth={1.5} />}
            {t === 'brief' ? 'Interview Brief' : 'Mock Q&A'}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {tab === 'brief' ? (
          brief ? (
            <div className="space-y-6">
              {/* Opening pitch */}
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-faint)] mb-2">
                  Opening Pitch
                </p>
                <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-md px-4 py-3">
                  <p className="text-[13px] text-[var(--color-text)] leading-relaxed italic">
                    "{brief.opening_pitch}"
                  </p>
                </div>
              </div>

              {/* Key themes */}
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-faint)] mb-2">
                  Key Themes
                </p>
                <div className="flex flex-wrap gap-2">
                  {brief.key_themes.map((theme) => (
                    <span
                      key={theme}
                      className="text-[12px] px-2.5 py-1 rounded-pill bg-[var(--color-surface-sunken)] text-[var(--color-text)] border border-[var(--color-border)]"
                    >
                      {theme}
                    </span>
                  ))}
                </div>
              </div>

              {/* Likely questions */}
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-faint)] mb-2">
                  Likely Questions ({brief.likely_questions.length})
                </p>
                <div className="space-y-2">
                  {brief.likely_questions.map((q, i) => (
                    <QuestionCard
                      key={i}
                      q={q}
                      onPractice={(question) => {
                        setTab('mock')
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* STAR stories */}
              {brief.star_stories.length > 0 && (
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-faint)] mb-2">
                    STAR Stories
                  </p>
                  <div className="space-y-3">
                    {brief.star_stories.map((s, i) => (
                      <div
                        key={i}
                        className="border border-[var(--color-border)] rounded-md px-4 py-3"
                      >
                        <p className="text-[11px] font-medium text-[var(--color-muted)] mb-1">
                          {s.question_hook}
                        </p>
                        <p className="text-[12px] text-[var(--color-text)] leading-relaxed">
                          {s.suggested_story}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Company angles */}
              {brief.company_angles.length > 0 && (
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-faint)] mb-2">
                    Company Angles
                  </p>
                  <ul className="space-y-1">
                    {brief.company_angles.map((angle, i) => (
                      <li key={i} className="flex items-start gap-2 text-[12px] text-[var(--color-text)]">
                        <span className="text-[var(--color-faint)] mt-0.5">•</span>
                        {angle}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Red flags */}
              {brief.red_flags_to_address.length > 0 && (
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-amber-600 mb-2">
                    Address Proactively
                  </p>
                  <ul className="space-y-1">
                    {brief.red_flags_to_address.map((flag, i) => (
                      <li key={i} className="flex items-start gap-2 text-[12px] text-[var(--color-text)]">
                        <span className="text-amber-500 mt-0.5">⚠</span>
                        {flag}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-40 text-center">
              <p className="text-[13px] text-[var(--color-muted)] mb-2">Brief not generated yet</p>
              <p className="text-[12px] text-[var(--color-faint)]">
                Use the "Prep Interview" button on the opportunity card to generate one.
              </p>
            </div>
          )
        ) : (
          <MockPanel interview={interview} />
        )}
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────

export function InterviewCenter() {
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const { data: interviews = [], isLoading, error } = useQuery({
    queryKey: ['interviews'],
    queryFn: () => api.interviews.list(),
    staleTime: 30_000,
  })

  const selected = interviews.find((i) => i.id === selectedId) ?? interviews[0] ?? null

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-[13px] text-[var(--color-faint)]">Loading interviews...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-[13px] text-red-500">Failed to load interviews.</p>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-56px)]">
      {/* Left list */}
      <div className="w-[280px] shrink-0 border-r border-[var(--color-border)] flex flex-col">
        <div className="px-4 py-4 border-b border-[var(--color-border)]">
          <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-faint)]">
            Interviews ({interviews.length})
          </p>
        </div>

        {interviews.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-2">
            <Sparkles size={24} strokeWidth={1} className="text-[var(--color-faint)]" />
            <p className="text-[13px] text-[var(--color-muted)]">No interviews yet</p>
            <p className="text-[11px] text-[var(--color-faint)]">
              When an opportunity reaches the interview stage, click "Prep Interview" on the Kanban card.
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto py-2">
            {interviews.map((interview) => {
              const hasBrief = !!interview.brief
              const active = (selectedId ?? interviews[0]?.id) === interview.id
              return (
                <button
                  key={interview.id}
                  onClick={() => setSelectedId(interview.id)}
                  className={cn(
                    'w-full text-left px-4 py-3 border-b border-[var(--color-border)] transition-colors',
                    active ? 'bg-[var(--color-bg)]' : 'hover:bg-[var(--color-bg)]',
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[12px] font-medium text-[var(--color-text)] truncate">
                      Interview #{interview.id.slice(0, 6)}
                    </p>
                    {hasBrief ? (
                      <span className="text-[10px] text-green-600 font-medium">Ready</span>
                    ) : (
                      <span className="text-[10px] text-[var(--color-faint)]">No brief</span>
                    )}
                  </div>
                  <p className="text-[11px] text-[var(--color-faint)]">
                    {new Date(interview.created_at).toLocaleDateString()}
                  </p>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Right detail */}
      <div className="flex-1 overflow-hidden">
        {selected ? (
          <InterviewDetail interview={selected} />
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-[13px] text-[var(--color-faint)]">Select an interview</p>
          </div>
        )}
      </div>
    </div>
  )
}
