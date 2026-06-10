'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle, Loader2, AlertCircle, Clock, XCircle, ThumbsUp } from 'lucide-react'
import { api } from '@/lib/api'
import { useAgentTaskStream } from '@/lib/ws'
import { formatRelative, titleCase } from '@/lib/utils'
import type { AgentTask, AgentStatus } from '@/types'

const STATUS_ICON: Record<AgentStatus, React.ReactNode> = {
  queued: <Clock size={14} className="text-[var(--color-muted)]" />,
  running: <Loader2 size={14} className="text-info animate-spin" />,
  succeeded: <CheckCircle size={14} className="text-success" />,
  failed: <AlertCircle size={14} className="text-danger" />,
  needs_approval: <ThumbsUp size={14} className="text-warn" />,
  cancelled: <XCircle size={14} className="text-[var(--color-faint)]" />,
}

export function AgentTaskFeed() {
  const qc = useQueryClient()
  const [limit] = useState(20)

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks', limit],
    queryFn: () => api.tasks.list({ limit }),
    refetchInterval: 10_000,
  })

  useAgentTaskStream((incoming) => {
    qc.setQueryData<AgentTask[]>(['tasks', limit], (prev = []) => {
      const idx = prev.findIndex((t) => t.id === incoming.id)
      if (idx >= 0) {
        const updated = [...prev]
        updated[idx] = incoming
        return updated
      }
      return [incoming, ...prev].slice(0, limit)
    })
  })

  const approve = useMutation({
    mutationFn: (id: string) => api.tasks.approve(id),
    onSuccess: (task) => {
      qc.setQueryData<AgentTask[]>(['tasks', limit], (prev = []) =>
        prev.map((t) => (t.id === task.id ? task : t)),
      )
    },
  })

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md">
      <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
        <h3 className="text-[15px] font-semibold text-[var(--color-text)]">Agent Activity</h3>
        <span className="text-[11px] font-medium uppercase tracking-widest text-[var(--color-muted)]">
          Live
        </span>
      </div>

      {isLoading ? (
        <div className="p-6 space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-10 rounded bg-[var(--color-surface-sunken)] animate-pulse" />
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <p className="px-6 py-8 text-center text-[13px] text-[var(--color-muted)]">
          No agent activity yet. Add a job to get started.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--color-border)]">
          {tasks.map((task) => (
            <li key={task.id} className="flex items-center gap-3 px-6 py-3">
              <span className="shrink-0">{STATUS_ICON[task.status]}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-[var(--color-text)] truncate">
                  {titleCase(task.agent_name)} agent
                </p>
                {task.error && (
                  <p className="text-[11px] text-danger truncate">{task.error}</p>
                )}
              </div>
              <span className={`pill-${task.status} text-[11px] font-medium px-2 py-0.5 rounded-pill shrink-0`}>
                {task.status}
              </span>
              <span className="text-[11px] text-[var(--color-faint)] shrink-0 w-16 text-right tabular">
                {formatRelative(task.created_at)}
              </span>
              {task.status === 'needs_approval' && (
                <button
                  onClick={() => approve.mutate(task.id)}
                  disabled={approve.isPending}
                  className="shrink-0 h-7 px-3 rounded-sm bg-warn/10 text-warn text-[12px] font-medium hover:bg-warn/20 transition-colors disabled:opacity-50"
                >
                  Approve
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
