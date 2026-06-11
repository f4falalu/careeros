'use client'
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X } from 'lucide-react'
import { api } from '@/lib/api'
import type { Skill } from '@/types'

function ProficiencyDots({ value }: { value: number | null | undefined }) {
  const v = value ?? 0
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={`w-1.5 h-1.5 rounded-full ${i <= v ? 'bg-[var(--color-text)]' : 'bg-[var(--color-border)]'}`}
        />
      ))}
    </span>
  )
}

interface Props {
  skills: Skill[]
}

export function SkillsSection({ skills }: Props) {
  const qc = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [proficiency, setProficiency] = useState(3)

  const upsert = useMutation({
    mutationFn: () =>
      api.profile.skills.upsert({ name: name.trim(), proficiency }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profile-skills'] })
      setName('')
      setProficiency(3)
      setAdding(false)
    },
  })

  const del = useMutation({
    mutationFn: (id: string) =>
      api.profile.skills.delete(skills.find((s) => s.id === id)?.name ?? id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profile-skills'] }),
  })

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && name.trim()) {
      upsert.mutate()
    }
    if (e.key === 'Escape') {
      setAdding(false)
      setName('')
    }
  }

  return (
    <section id="skills" className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-[14px] font-semibold text-[var(--color-text)]">Skills</h2>
          {skills.length > 0 && (
            <span className="text-[11px] text-[var(--color-faint)] tabular">{skills.length}</span>
          )}
        </div>
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 h-7 px-3 rounded-sm text-[12px] font-medium bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg)] transition-colors"
        >
          <Plus size={12} strokeWidth={2} />
          Add
        </button>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md p-4">
        {skills.length === 0 && !adding && (
          <p
            className="text-[12px] text-[var(--color-faint)] text-center py-4 cursor-pointer"
            onClick={() => setAdding(true)}
          >
            Add skills to power AI matching → Click to start
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {skills.map((skill) => (
            <div
              key={skill.id}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-sm bg-[var(--color-surface-sunken)] border border-[var(--color-border)] group"
            >
              <span className="text-[12px] text-[var(--color-text)]">{skill.name}</span>
              <ProficiencyDots value={skill.proficiency} />
              <button
                onClick={() => del.mutate(skill.id)}
                disabled={del.isPending}
                className="text-[var(--color-faint)] hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity ml-0.5"
              >
                <X size={10} strokeWidth={2} />
              </button>
            </div>
          ))}

          {adding && (
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-sm border border-[var(--color-border)] bg-[var(--color-surface-sunken)]">
              <input
                autoFocus
                className="text-[12px] bg-transparent outline-none text-[var(--color-text)] placeholder:text-[var(--color-faint)] w-32"
                placeholder="Skill name…"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <div className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map((i) => (
                  <button
                    key={i}
                    onClick={() => setProficiency(i)}
                    className={`w-3 h-3 rounded-full border transition-colors ${
                      i <= proficiency
                        ? 'bg-[var(--color-text)] border-[var(--color-text)]'
                        : 'bg-transparent border-[var(--color-border)]'
                    }`}
                  />
                ))}
              </div>
              <button
                onClick={() => name.trim() && upsert.mutate()}
                disabled={!name.trim() || upsert.isPending}
                className="text-[11px] font-medium text-[var(--color-text)] hover:opacity-70 disabled:opacity-30"
              >
                Add
              </button>
              <button
                onClick={() => { setAdding(false); setName('') }}
                className="text-[var(--color-faint)] hover:text-[var(--color-muted)]"
              >
                <X size={11} strokeWidth={1.5} />
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
