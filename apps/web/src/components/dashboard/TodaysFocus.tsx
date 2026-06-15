'use client'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { Circle, CheckCircle2, ArrowRight } from 'lucide-react'
import { api } from '@/lib/api'
import { titleCase } from '@/lib/utils'
import type { AgentTask } from '@/types'

const FAKE_TIMES = ['9:00 AM', '11:30 AM', '2:00 PM', '4:00 PM', '5:30 PM']

function taskLabel(task: AgentTask): string {
  const agentMap: Record<string, string> = {
    resume: 'Review tailored resume',
    outreach: 'Approve outreach draft',
    interview: 'Complete interview prep',
    vvp: 'Review VVP draft',
    match: 'Review match analysis',
    research: 'Review company research',
    cover: 'Review cover letter',
  }
  return agentMap[task.agent_name] ?? `Review ${titleCase(task.agent_name)} task`
}

function taskSub(task: AgentTask): string {
  if (task.related_type === 'opportunity') return 'Ready for review'
  return titleCase(task.agent_name) + ' Agent'
}

export function TodaysFocus() {
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks', { status: 'needs_approval', limit: 5 }],
    queryFn: () => api.tasks.list({ status: 'needs_approval', limit: 5 }),
    refetchInterval: 15_000,
  })

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg">
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-[var(--color-border)]">
        <h3 className="text-[13.5px] font-semibold text-[var(--color-text)]">Today&apos;s Focus</h3>
        <Link
          href="/agents"
          className="flex items-center gap-1 text-[11px] text-[var(--color-emerald)] hover:opacity-80 transition-opacity font-medium"
        >
          See full schedule <ArrowRight size={10} />
        </Link>
      </div>

      {isLoading ? (
        <div className="px-4 py-3 space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-10 rounded-md bg-[var(--color-surface-sunken)] animate-pulse" />
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <div className="px-4 py-6 text-center">
          <CheckCircle2 size={22} className="mx-auto mb-2 text-[var(--color-emerald)]" />
          <p className="text-[12.5px] text-[var(--color-muted)]">All caught up for today!</p>
        </div>
      ) : (
        <ul className="divide-y divide-[var(--color-border)]">
          {tasks.map((task, i) => (
            <li key={task.id} className="flex items-start gap-3 px-4 py-3">
              <Circle size={14} className="text-[var(--color-faint)] mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-[var(--color-text)] truncate">
                  {taskLabel(task)}
                </p>
                <p className="text-[11.5px] text-[var(--color-muted)]">{taskSub(task)}</p>
              </div>
              <span className="text-[11px] text-[var(--color-faint)] shrink-0 tabular font-medium">
                {FAKE_TIMES[i] ?? ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
