'use client'
import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Sparkles, Loader2, X } from 'lucide-react'
import { api } from '@/lib/api'
import type { Profile } from '@/types'

const QUESTIONS: { key: string; label: string; placeholder: string }[] = [
  {
    key: 'excites',
    label: 'What kind of work excites you?',
    placeholder: 'Building AI products that solve real operational problems…',
  },
  {
    key: 'solving',
    label: 'What problem do you enjoy solving most?',
    placeholder: 'Turning ambiguous data into clear decisions…',
  },
  {
    key: 'environment',
    label: 'What environments help you perform best?',
    placeholder: 'Small teams, high autonomy, direct impact…',
  },
  {
    key: 'goals',
    label: 'What are your long-term career goals?',
    placeholder: 'Become a Chief Product Officer at an AI-native company…',
  },
  {
    key: 'why_move',
    label: 'Why are you considering a new role?',
    placeholder: 'Looking for a role where I can lead AI strategy from day 1…',
  },
]

interface Props {
  profile: Profile | null
}

export function CareerQuestionsSection({ profile }: Props) {
  const qc = useQueryClient()
  const [answers, setAnswers] = useState<Record<string, string>>(
    () => (profile?.career_questions as Record<string, string>) ?? {},
  )
  const [dirty, setDirty] = useState(false)
  const [suggestions, setSuggestions] = useState<Record<string, string> | null>(null)
  const [rationale, setRationale] = useState('')

  // The profile is fetched asynchronously, so it's null on first mount and the
  // useState initializer above seeds answers to {}. Re-hydrate once it loads,
  // but never clobber unsaved edits in progress.
  useEffect(() => {
    if (!dirty && profile?.career_questions) {
      setAnswers(profile.career_questions as Record<string, string>)
    }
  }, [profile, dirty])

  const save = useMutation({
    mutationFn: () =>
      api.profile.update({ career_questions: answers }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profile'] })
      setDirty(false)
    },
  })

  // Advisor: fetches AI suggestions from the knowledge graph. Suggestions are
  // previews only — nothing is applied or saved until the user confirms.
  const suggest = useMutation({
    mutationFn: () => api.profile.suggestGoals(),
    onSuccess: (data) => {
      setSuggestions(data.suggestions)
      setRationale(data.rationale)
    },
  })

  const set = (key: string, value: string) => {
    setAnswers((a) => ({ ...a, [key]: value }))
    setDirty(true)
  }

  const applyOne = (key: string) => {
    if (!suggestions?.[key]) return
    set(key, suggestions[key])
  }

  const applyAll = () => {
    if (!suggestions) return
    setAnswers((a) => ({ ...a, ...suggestions }))
    setDirty(true)
  }

  const dismiss = () => {
    setSuggestions(null)
    setRationale('')
  }

  return (
    <section id="career" className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[14px] font-semibold text-[var(--color-text)]">Career Goals</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => suggest.mutate()}
            disabled={suggest.isPending}
            className="flex items-center gap-1.5 h-7 px-3 rounded-sm text-[12px] font-medium border border-[var(--color-violet)] text-[var(--color-violet)] hover:bg-[var(--color-violet-dim)] disabled:opacity-50 transition-colors"
          >
            {suggest.isPending ? (
              <Loader2 size={11} className="animate-spin" />
            ) : (
              <Sparkles size={11} strokeWidth={2} />
            )}
            {suggest.isPending ? 'Thinking…' : 'Suggest with AI'}
          </button>
          {dirty && (
            <button
              onClick={() => save.mutate()}
              disabled={save.isPending}
              className="flex items-center gap-1 h-7 px-3 rounded-sm text-[12px] font-medium bg-[var(--color-text)] text-[var(--color-bg)] hover:opacity-80 disabled:opacity-40"
            >
              <Check size={11} strokeWidth={2} />
              {save.isPending ? 'Saving…' : 'Save'}
            </button>
          )}
        </div>
      </div>

      {suggest.isError && (
        <p className="text-[11px] text-danger">
          Couldn’t generate suggestions. Please try again.
        </p>
      )}

      {/* Advisor banner — suggestions are proposals; user confirms before saving */}
      {suggestions && (
        <div className="rounded-md border border-[var(--color-violet)] bg-[var(--color-violet-dim)] p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <Sparkles size={13} className="mt-0.5 text-[var(--color-violet)] shrink-0" />
              <div>
                <p className="text-[12px] font-medium text-[var(--color-violet-text)]">
                  AI career advisor — suggestions below
                </p>
                {rationale && (
                  <p className="mt-0.5 text-[11px] text-[var(--color-violet-text)] opacity-90">
                    {rationale}
                  </p>
                )}
                <p className="mt-1 text-[10px] text-[var(--color-violet-text)] opacity-70">
                  Nothing is saved until you apply a suggestion and click Save.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={applyAll}
                className="h-6 px-2 rounded text-[11px] font-medium text-white bg-[var(--color-violet)] hover:opacity-90"
              >
                Apply all
              </button>
              <button
                onClick={dismiss}
                title="Dismiss suggestions"
                className="p-1 rounded text-[var(--color-violet-text)] hover:bg-white/40"
              >
                <X size={13} />
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md divide-y divide-[var(--color-border)]">
        {QUESTIONS.map((q) => {
          const suggestion = suggestions?.[q.key]
          const showSuggestion = !!suggestion && suggestion !== (answers[q.key] ?? '')
          return (
            <div key={q.key} className="p-4">
              <label className="block text-[12px] font-medium text-[var(--color-text)] mb-2">
                {q.label}
              </label>
              <textarea
                rows={2}
                className="w-full px-3 py-2 rounded-sm border border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-[12px] text-[var(--color-text)] placeholder:text-[var(--color-faint)] focus:outline-none focus:border-[var(--color-muted)] resize-none"
                placeholder={q.placeholder}
                value={answers[q.key] ?? ''}
                onChange={(e) => set(q.key, e.target.value)}
              />
              {showSuggestion && (
                <div className="mt-2 rounded-sm border border-[var(--color-violet)] bg-[var(--color-violet-dim)] p-2.5">
                  <div className="flex items-center gap-1 mb-1">
                    <Sparkles size={9} className="text-[var(--color-violet)]" />
                    <span className="text-[10px] font-medium text-[var(--color-violet-text)]">
                      Suggested
                    </span>
                  </div>
                  <p className="text-[12px] text-[var(--color-violet-text)]">{suggestion}</p>
                  <button
                    onClick={() => applyOne(q.key)}
                    className="mt-2 flex items-center gap-1 h-5 px-2 rounded text-[10px] font-medium text-white bg-[var(--color-violet)] hover:opacity-90"
                  >
                    <Check size={9} strokeWidth={2.5} />
                    Use this
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
