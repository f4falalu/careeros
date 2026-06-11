'use client'
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check } from 'lucide-react'
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

  const save = useMutation({
    mutationFn: () =>
      api.profile.update({ career_questions: answers }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profile'] })
      setDirty(false)
    },
  })

  const set = (key: string, value: string) => {
    setAnswers((a) => ({ ...a, [key]: value }))
    setDirty(true)
  }

  return (
    <section id="career" className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[14px] font-semibold text-[var(--color-text)]">Career Goals</h2>
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

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md divide-y divide-[var(--color-border)]">
        {QUESTIONS.map((q) => (
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
          </div>
        ))}
      </div>
    </section>
  )
}
