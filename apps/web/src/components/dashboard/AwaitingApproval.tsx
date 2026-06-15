'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { api } from '@/lib/api'
import { useAgentTaskStream } from '@/lib/ws'
import { formatRelative, titleCase } from '@/lib/utils'
import type { AgentTask } from '@/types'

function taskDisplayName(task: AgentTask): string {
  const names: Record<string, string> = {
    resume: 'Resume tailored',
    vvp: 'VVP strategy ready',
    outreach: 'Outreach draft ready',
    interview: 'Interview brief ready',
    match: 'Match analysis ready',
    cover: 'Cover letter ready',
    research: 'Company research ready',
  }
  return names[task.agent_name] ?? titleCase(task.agent_name) + ' task ready'
}

function taskTarget(task: AgentTask): string {
  if (task.related_type === 'opportunity') return 'for opportunity'
  if (task.related_type === 'application') return 'for application'
  if (task.related_type === 'contact') return 'to contact'
  return 'awaiting review'
}

function ApprovalRow({ task, onApprove }: { task: AgentTask; onApprove: (id: string) => void }) {
  const [loading, setLoading] = useState(false)
  return (
    <li className="flex items-start gap-2.5 px-4 py-3">
      <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-emerald)] mt-2 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[12.5px] font-medium text-[var(--color-text)] truncate">
          {taskDisplayName(task)}
        </p>
        <p className="text-[11px] text-[var(--color-muted)]">
          Ready · {formatRelative(task.created_at)}
        </p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <Link
          href="/agents"
          className="h-6 px-2 rounded-md border border-[var(--color-border)] text-[11px] font-medium text-[var(--color-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-border-strong)] transition-colors flex items-center"
        >
          Review
        </Link>
        <button
          onClick={async () => {
            setLoading(true)
            await onApprove(task.id)
            setLoading(false)
          }}
          disabled={loading}
          className="h-6 px-2.5 rounded-md bg-[var(--color-emerald)] text-white text-[11px] font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center"
        >
          {loading ? '…' : 'Approve'}
        </button>
      </div>
    </li>
  )
}

export function AwaitingApproval() {
  const qc = useQueryClient()

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks', { status: 'needs_approval', limit: 20 }],
    queryFn: () => api.tasks.list({ status: 'needs_approval', limit: 20 }),
    refetchInterval: 10_000,
  })

  useAgentTaskStream((incoming) => {
    qc.setQueryData<AgentTask[]>(['tasks', { status: 'needs_approval', limit: 20 }], (prev = []) => {
      if (incoming.status !== 'needs_approval') {
        return prev.filter((t) => t.id !== incoming.id)
      }
      const idx = prev.findIndex((t) => t.id === incoming.id)
      if (idx >= 0) {
        const updated = [...prev]
        updated[idx] = incoming
        return updated
      }
      return [incoming, ...prev].slice(0, 20)
    })
  })

  const approve = useMutation({
    mutationFn: (id: string) => api.tasks.approve(id),
    onSuccess: (task) => {
      qc.setQueryData<AgentTask[]>(['tasks', { status: 'needs_approval', limit: 20 }], (prev = []) =>
        prev.filter((t) => t.id !== task.id),
      )
    },
  })

  const pending = tasks.slice(0, 3)
  const total = tasks.length

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg">
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-2">
          <h3 className="text-[13.5px] font-semibold text-[var(--color-text)]">Awaiting Your Approval</h3>
          {total > 0 && (
            <span className="w-5 h-5 rounded-full bg-[var(--color-amber-dim)] text-[var(--color-amber)] text-[10px] font-bold flex items-center justify-center">
              {total}
            </span>
          )}
        </div>
        {total > 3 && (
          <Link
            href="/agents"
            className="flex items-center gap-1 text-[11px] text-[var(--color-amber)] hover:opacity-80 transition-opacity font-medium"
          >
            View all <ArrowRight size={10} />
          </Link>
        )}
      </div>

      {isLoading ? (
        <div className="px-4 py-3 space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-12 rounded-md bg-[var(--color-surface-sunken)] animate-pulse" />
          ))}
        </div>
      ) : pending.length === 0 ? (
        <p className="px-4 py-6 text-center text-[12.5px] text-[var(--color-muted)]">
          No approvals pending — everything is handled.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--color-border)]">
          {pending.map((task) => (
            <ApprovalRow
              key={task.id}
              task={task}
              onApprove={(id) => approve.mutateAsync(id)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
