'use client'
import { useQuery } from '@tanstack/react-query'
import {
  Inbox,
  Search,
  Target,
  FileText,
  Mail,
  Layers,
  Send,
  Clock,
  UserSearch,
  Mic,
  TrendingUp,
  Globe,
  Zap,
  Bot,
  type LucideIcon,
} from 'lucide-react'
import { KpiCard } from '@/components/cards/KpiCard'
import { AgentTaskFeed } from '@/components/cards/AgentTaskFeed'
import { api } from '@/lib/api'
import type { AgentTask } from '@/types'

interface AgentDef {
  name: string
  label: string
  description: string
  icon: LucideIcon
  gated?: boolean
}

// Catalog of the agents that exist in apps/api/src/agents.
const CATALOG: AgentDef[] = [
  { name: 'intake', label: 'Intake', icon: Inbox, description: 'Parses pasted job links and text into structured opportunities.' },
  { name: 'research', label: 'Research', icon: Search, description: 'Builds company briefs: business model, funding, news, culture.' },
  { name: 'match', label: 'Match', icon: Target, description: 'Scores how well your profile fits a role and flags skill gaps.' },
  { name: 'resume', label: 'Resume', icon: FileText, description: 'Tailors your master resume to a role — facts only, validated.' },
  { name: 'cover', label: 'Cover Letter', icon: Mail, description: 'Drafts role-specific cover letters grounded in your profile.' },
  { name: 'vvp', label: 'VVP', icon: Layers, description: 'Proposes and drafts value-validation projects to stand out.' },
  { name: 'outreach', label: 'Outreach', icon: Send, description: 'Drafts recruiter and hiring-manager messages for your approval.' },
  { name: 'followup', label: 'Follow-up', icon: Clock, description: 'Schedules and drafts follow-up nudges on pending outreach.' },
  { name: 'enrich', label: 'Enrich', icon: UserSearch, description: 'Finds public contact details for people at target companies.' },
  { name: 'interview', label: 'Interview', icon: Mic, description: 'Generates interview briefs and runs mock Q&A coaching.' },
  { name: 'strategist', label: 'Strategist', icon: TrendingUp, description: 'Analyzes your pipeline for skill gaps and targeting advice.' },
  { name: 'scrape', label: 'Scrape', icon: Globe, gated: true, description: 'Pulls roles from careers pages — gated, human-in-the-loop.' },
  { name: 'apply', label: 'Auto-Apply', icon: Zap, gated: true, description: 'Submits applications when autonomy is enabled — gated.' },
  { name: 'tracker', label: 'Tracker', icon: Bot, description: 'Keeps your pipeline stages in sync as applications move.' },
]

function AgentCard({ agent, runs }: { agent: AgentDef; runs: number }) {
  const Icon = agent.icon
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md p-5 hover-lift">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-sm bg-[var(--color-bg)] border border-[var(--color-border)] flex items-center justify-center shrink-0">
          <Icon size={16} strokeWidth={1.5} className="text-[var(--color-muted)]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-[14px] font-semibold text-[var(--color-text)]">{agent.label}</p>
            {agent.gated && (
              <span className="text-[10px] font-medium uppercase tracking-wide text-warn bg-warn/10 px-1.5 py-0.5 rounded-pill">
                Gated
              </span>
            )}
          </div>
          <p className="text-[12px] text-[var(--color-muted)] mt-1 leading-relaxed">{agent.description}</p>
        </div>
      </div>
      <div className="mt-4 pt-3 border-t border-[var(--color-border)] text-[11px] text-[var(--color-faint)] tabular">
        {runs} {runs === 1 ? 'run' : 'runs'}
      </div>
    </div>
  )
}

export function AgentsConsole() {
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks', 'agents-console'],
    queryFn: () => api.tasks.list({ limit: 200 }),
    refetchInterval: 10_000,
  })

  const runsByAgent = tasks.reduce<Record<string, number>>((acc, t) => {
    acc[t.agent_name] = (acc[t.agent_name] ?? 0) + 1
    return acc
  }, {})

  const active = tasks.filter((t: AgentTask) => t.status === 'running' || t.status === 'queued').length
  const finished = tasks.filter((t: AgentTask) => t.status === 'succeeded' || t.status === 'failed')
  const succeeded = finished.filter((t: AgentTask) => t.status === 'succeeded').length
  const successRate = finished.length > 0 ? Math.round((succeeded / finished.length) * 100) : null
  const totalCost = tasks.reduce((sum: number, t: AgentTask) => sum + (t.cost_usd ?? 0), 0)

  return (
    <div className="space-y-8 max-w-[1440px]">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total Runs" value={isLoading ? '—' : tasks.length} sub="recent activity" loading={isLoading} />
        <KpiCard label="Active Now" value={isLoading ? '—' : active} sub="queued or running" loading={isLoading} highlight />
        <KpiCard label="Success Rate" value={isLoading ? '—' : successRate === null ? '—' : `${successRate}%`} sub="of finished runs" loading={isLoading} />
        <KpiCard label="Spend" value={isLoading ? '—' : `$${totalCost.toFixed(2)}`} sub="across recent runs" loading={isLoading} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
        <div>
          <h3 className="text-[15px] font-semibold text-[var(--color-text)] mb-4">Agent Catalog</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {CATALOG.map((agent) => (
              <AgentCard key={agent.name} agent={agent} runs={runsByAgent[agent.name] ?? 0} />
            ))}
          </div>
        </div>
        <AgentTaskFeed />
      </div>
    </div>
  )
}
