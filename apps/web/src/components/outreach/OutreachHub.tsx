'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Mail, Check, Archive, Copy, Loader2, ChevronDown } from 'lucide-react'
import { api } from '@/lib/api'
import { formatRelative, titleCase } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { MessageState, OutreachMessage } from '@/types'

const STATE_LABELS: Record<MessageState, string> = {
  draft: 'Draft',
  approved: 'Approved',
  sent: 'Sent',
  replied: 'Replied',
  bounced: 'Bounced',
  archived: 'Archived',
}

const STATE_COLORS: Record<MessageState, string> = {
  draft: 'bg-amber-500/10 text-amber-600',
  approved: 'bg-emerald-500/10 text-emerald-600',
  sent: 'bg-blue-500/10 text-blue-600',
  replied: 'bg-purple-500/10 text-purple-600',
  bounced: 'bg-red-500/10 text-red-600',
  archived: 'bg-[var(--color-surface-sunken)] text-[var(--color-faint)]',
}

function MessageCard({
  message,
  onApprove,
  onArchive,
}: {
  message: OutreachMessage
  onApprove: (id: string) => void
  onArchive: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    const text = message.subject ? `Subject: ${message.subject}\n\n${message.body}` : message.body
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md">
      {/* Header row */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
        onClick={() => setExpanded((e) => !e)}
      >
        <Mail size={14} strokeWidth={1.5} className="shrink-0 text-[var(--color-faint)]" />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium text-[var(--color-text)] truncate">
            {message.subject ?? `${titleCase(message.channel)} outreach`}
          </p>
          <p className="text-[11px] text-[var(--color-faint)]">
            {titleCase(message.channel)} · {formatRelative(message.created_at)}
          </p>
        </div>
        <span
          className={cn(
            'shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-pill',
            STATE_COLORS[message.state],
          )}
        >
          {STATE_LABELS[message.state]}
        </span>
        <ChevronDown
          size={14}
          strokeWidth={1.5}
          className={cn(
            'shrink-0 text-[var(--color-faint)] transition-transform',
            expanded && 'rotate-180',
          )}
        />
      </div>

      {/* Body */}
      {expanded && (
        <div className="border-t border-[var(--color-border)] px-4 py-4">
          {message.subject && (
            <p className="text-[11px] text-[var(--color-faint)] mb-2 font-medium">
              Subject: {message.subject}
            </p>
          )}
          <pre className="text-[12px] text-[var(--color-text)] font-sans leading-relaxed whitespace-pre-wrap mb-4">
            {message.body}
          </pre>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {message.state === 'draft' && (
              <button
                onClick={() => onApprove(message.id)}
                className="flex items-center gap-1.5 h-7 px-3 rounded-sm text-[11px] font-medium bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 transition-colors"
              >
                <Check size={11} strokeWidth={2} />
                Approve
              </button>
            )}
            <button
              onClick={copy}
              className="flex items-center gap-1.5 h-7 px-3 rounded-sm text-[11px] font-medium bg-[var(--color-surface-sunken)] text-[var(--color-muted)] hover:bg-[var(--color-border)] transition-colors"
            >
              {copied ? <Check size={11} strokeWidth={2} /> : <Copy size={11} strokeWidth={1.5} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            {message.state !== 'archived' && (
              <button
                onClick={() => onArchive(message.id)}
                className="flex items-center gap-1.5 h-7 px-3 rounded-sm text-[11px] font-medium text-[var(--color-faint)] hover:text-[var(--color-muted)] hover:bg-[var(--color-surface-sunken)] transition-colors"
              >
                <Archive size={11} strokeWidth={1.5} />
                Archive
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Filter tabs ───────────────────────────────────────────────

const FILTER_STATES: Array<MessageState | 'all'> = ['all', 'draft', 'approved', 'sent', 'archived']

// ── Main hub ──────────────────────────────────────────────────

export function OutreachHub() {
  const qc = useQueryClient()
  const [filter, setFilter] = useState<MessageState | 'all'>('all')

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ['outreach', filter],
    queryFn: () => api.outreach.list(filter === 'all' ? undefined : filter),
    staleTime: 30_000,
  })

  const approve = useMutation({
    mutationFn: (id: string) => api.outreach.approve(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['outreach'] }),
  })

  const archive = useMutation({
    mutationFn: (id: string) => api.outreach.archive(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['outreach'] }),
  })

  const draftCount = messages.filter((m) => m.state === 'draft').length

  return (
    <div className="px-8 py-6 max-w-3xl">
      {/* Page header */}
      <div className="flex items-center gap-3 mb-6">
        <Mail size={20} strokeWidth={1.5} className="text-[var(--color-muted)]" />
        <div>
          <h1 className="text-[20px] font-semibold text-[var(--color-text)]">Outreach Hub</h1>
          <p className="text-[12px] text-[var(--color-faint)]">
            AI-drafted messages · approval required before sending
          </p>
        </div>
        {draftCount > 0 && (
          <span className="ml-auto text-[11px] font-medium px-2 py-0.5 rounded-pill bg-amber-500/10 text-amber-600">
            {draftCount} pending
          </span>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 mb-5 border-b border-[var(--color-border)] pb-3">
        {FILTER_STATES.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={cn(
              'px-3 py-1.5 rounded-sm text-[12px] font-medium transition-colors',
              filter === s
                ? 'bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-text)]'
                : 'text-[var(--color-faint)] hover:text-[var(--color-muted)]',
            )}
          >
            {s === 'all' ? 'All' : STATE_LABELS[s]}
          </button>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-[var(--color-faint)]" strokeWidth={1.5} />
        </div>
      ) : messages.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Mail size={36} strokeWidth={1} className="text-[var(--color-faint)] mb-3" />
          <p className="text-[14px] text-[var(--color-faint)]">No outreach drafts yet.</p>
          <p className="text-[12px] text-[var(--color-faint)] mt-1">
            Click the <strong>mail icon</strong> on any job card to draft a message.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {messages.map((m) => (
            <MessageCard
              key={m.id}
              message={m}
              onApprove={approve.mutate}
              onArchive={archive.mutate}
            />
          ))}
        </div>
      )}
    </div>
  )
}
