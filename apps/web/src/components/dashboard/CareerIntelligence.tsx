'use client'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { Brain, ArrowRight } from 'lucide-react'
import { api } from '@/lib/api'

const PLACEHOLDER = {
  themes: ['AI Product Management', 'Healthcare Innovation', 'Supply Chain Transformation'],
  strengths: ['Product Strategy', 'Stakeholder Management', 'AI Development'],
  gaps: ['Experiment Design', 'Growth Metrics', 'Data Analysis (Advanced)'],
}

function Section({ title, items, dotClass }: { title: string; items: string[]; dotClass: string }) {
  return (
    <div className="flex-1 min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--color-faint)] mb-2.5">{title}</p>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2">
            <span className={`dot ${dotClass} mt-1.5 shrink-0`} />
            <span className="text-[12.5px] text-[var(--color-text)] leading-snug">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function CareerIntelligence() {
  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: () => api.profile.get(),
    staleTime: 5 * 60_000,
  })

  const { data: strategistTask } = useQuery({
    queryKey: ['strategist', 'latest'],
    queryFn: () => api.strategist.latest(),
    staleTime: 5 * 60_000,
  })

  const dna = profile?.career_dna
  const report = strategistTask?.output?.report

  const themes = dna?.archetype?.slice(0, 3) ?? PLACEHOLDER.themes
  const strengths = dna?.strengths?.slice(0, 3) ?? PLACEHOLDER.strengths
  const gaps = report?.skill_gaps?.slice(0, 3).map((g) => g.skill) ?? dna?.growth_areas?.slice(0, 3) ?? PLACEHOLDER.gaps

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Brain size={14} className="text-[var(--color-violet)]" />
          <h3 className="text-[14px] font-semibold text-[var(--color-text)]">Career Intelligence</h3>
        </div>
        <Link
          href="/analytics"
          className="flex items-center gap-1 text-[11.5px] text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors"
        >
          Learn more <ArrowRight size={11} />
        </Link>
      </div>
      <p className="text-[11.5px] text-[var(--color-muted)] mb-4">AI-powered insights from your career graph</p>

      <div className="flex gap-4">
        <Section title="Top Themes" items={themes} dotClass="dot-violet" />
        <div className="w-px bg-[var(--color-border)]" />
        <Section title="Emerging Strengths" items={strengths} dotClass="dot-emerald" />
        <div className="w-px bg-[var(--color-border)]" />
        <Section title="Skill Gaps" items={gaps} dotClass="dot-amber" />
      </div>
    </div>
  )
}
