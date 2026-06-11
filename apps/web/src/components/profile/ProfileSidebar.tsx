'use client'
import { Check, Circle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Profile, WorkExperience, Education, Skill, ProfileProject } from '@/types'

interface SectionStatus {
  label: string
  required: boolean
  done: boolean
}

interface Props {
  profile: Profile | null
  workExps: WorkExperience[]
  educations: Education[]
  skills: Skill[]
  projects: ProfileProject[]
  activeSection: string
  onScrollTo: (id: string) => void
}

export function ProfileSidebar({
  profile,
  workExps,
  educations,
  skills,
  projects,
  activeSection,
  onScrollTo,
}: Props) {
  const sections: (SectionStatus & { id: string })[] = [
    {
      id: 'hero',
      label: 'Basic Info',
      required: true,
      done: !!(profile?.headline || profile?.bio),
    },
    {
      id: 'work',
      label: 'Work Experience',
      required: true,
      done: workExps.length >= 1,
    },
    {
      id: 'education',
      label: 'Education',
      required: true,
      done: educations.length >= 1,
    },
    {
      id: 'skills',
      label: 'Skills',
      required: true,
      done: skills.length >= 3,
    },
    {
      id: 'projects',
      label: 'Projects',
      required: false,
      done: projects.length >= 1,
    },
    {
      id: 'career',
      label: 'Career Goals',
      required: false,
      done: !!(profile?.career_questions && Object.values(profile.career_questions).some(Boolean)),
    },
    {
      id: 'info',
      label: 'Personal Info',
      required: false,
      done: !!(profile?.languages?.length || profile?.work_auth || (profile?.links && Object.keys(profile.links).length > 0)),
    },
  ]

  const required = sections.filter((s) => s.required)
  const optional = sections.filter((s) => !s.required)
  const doneCount = sections.filter((s) => s.done).length
  const pct = Math.round((doneCount / sections.length) * 100)

  const barColor = pct >= 80 ? '#10B981' : pct >= 50 ? '#F59E0B' : '#6B7280'

  return (
    <aside className="w-[220px] shrink-0">
      <div className="sticky top-0 space-y-5">
        {/* Completion meter */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] font-semibold text-[var(--color-text)]">Profile Strength</span>
            <span className="text-[12px] font-bold tabular" style={{ color: barColor }}>
              {pct}%
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-[var(--color-surface-sunken)] overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, backgroundColor: barColor }}
            />
          </div>
        </div>

        {/* Required sections */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md p-3 space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-faint)] px-1 pb-1">
            Required {required.filter((s) => s.done).length}/{required.length}
          </p>
          {required.map((s) => (
            <button
              key={s.id}
              onClick={() => onScrollTo(s.id)}
              className={cn(
                'flex items-center gap-2.5 w-full px-2 py-1.5 rounded-sm text-[12px] text-left transition-colors',
                activeSection === s.id
                  ? 'bg-[var(--color-bg)] text-[var(--color-text)] font-medium'
                  : 'text-[var(--color-muted)] hover:bg-[var(--color-bg)]',
              )}
            >
              {s.done ? (
                <Check size={12} strokeWidth={2.5} className="text-emerald-500 shrink-0" />
              ) : (
                <Circle size={12} strokeWidth={1.5} className="text-[var(--color-faint)] shrink-0" />
              )}
              {s.label}
            </button>
          ))}
        </div>

        {/* Optional sections */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md p-3 space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-faint)] px-1 pb-1">
            Optional {optional.filter((s) => s.done).length}/{optional.length}
          </p>
          {optional.map((s) => (
            <button
              key={s.id}
              onClick={() => onScrollTo(s.id)}
              className={cn(
                'flex items-center gap-2.5 w-full px-2 py-1.5 rounded-sm text-[12px] text-left transition-colors',
                activeSection === s.id
                  ? 'bg-[var(--color-bg)] text-[var(--color-text)] font-medium'
                  : 'text-[var(--color-muted)] hover:bg-[var(--color-bg)]',
              )}
            >
              {s.done ? (
                <Check size={12} strokeWidth={2.5} className="text-emerald-500 shrink-0" />
              ) : (
                <Circle size={12} strokeWidth={1.5} className="text-[var(--color-faint)] shrink-0" />
              )}
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </aside>
  )
}
