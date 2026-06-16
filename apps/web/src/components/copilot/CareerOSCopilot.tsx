'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { useMutation, useQuery } from '@tanstack/react-query'

// ── Types ─────────────────────────────────────────────────────

interface PendingApproval {
  type: string
  entityId: string
  actions: string[]
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  pendingApproval?: PendingApproval
}

interface ConversationResponse {
  messageId: string
  response: string
  pendingApproval?: PendingApproval
}

interface HistoryMessage {
  id: string
  role: string
  content: string
  channel: string
  createdAt: string
}

// ── API helpers ───────────────────────────────────────────────

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

function getToken() {
  return process.env.NEXT_PUBLIC_APP_SECRET ?? ''
}

async function sendMessage(content: string, workspaceContext?: Record<string, unknown>): Promise<ConversationResponse> {
  const res = await fetch(`${API_URL}/conversations/message`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
    },
    body: JSON.stringify({ content, channel: 'web', workspaceContext }),
  })
  if (!res.ok) throw new Error(`API ${res.status}`)
  return res.json()
}

async function fetchHistory(limit = 50): Promise<HistoryMessage[]> {
  const res = await fetch(`${API_URL}/conversations/history?limit=${limit}&channel=web`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  })
  if (!res.ok) return []
  return res.json()
}

async function callApprove(
  messageId: string,
  action: string,
  entityId: string,
  entityType: string,
): Promise<void> {
  await fetch(`${API_URL}/conversations/approve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
    },
    body: JSON.stringify({ messageId, action, entityId, entityType }),
  })
}

// ── Workspace context extraction ──────────────────────────────

function useWorkspaceContext(): Record<string, unknown> | undefined {
  const pathname = usePathname()

  const patterns = [
    { re: /\/opportunities\/([^/]+)/, type: 'opportunity' },
    { re: /\/applications\/([^/]+)/, type: 'application' },
    { re: /\/companies\/([^/]+)/, type: 'company' },
    { re: /\/interviews\/([^/]+)/, type: 'interview' },
  ]

  for (const { re, type } of patterns) {
    const m = pathname.match(re)
    if (m) return { entityType: type, entityId: m[1] }
  }

  return undefined
}

// ── ApprovalCard ──────────────────────────────────────────────

function ApprovalCard({
  messageId,
  approval,
  onSettled,
}: {
  messageId: string
  approval: PendingApproval
  onSettled: (messageId: string, action: string) => void
}) {
  const [pending, setPending] = useState<string | null>(null)

  async function handleAction(action: string) {
    setPending(action)
    try {
      await callApprove(messageId, action, approval.entityId, approval.type)
      onSettled(messageId, action)
    } catch {
      setPending(null)
    }
  }

  const labels: Record<string, string> = { approve: 'Approve', review: 'Review', reject: 'Reject' }
  const variants: Record<string, string> = {
    approve: 'bg-[var(--color-text)] text-[var(--color-bg)]',
    review: 'bg-[var(--color-surface-sunken)] text-[var(--color-text)] border border-[var(--color-border)]',
    reject: 'bg-danger text-white',
  }

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {approval.actions.map((action) => (
        <button
          key={action}
          onClick={() => handleAction(action)}
          disabled={pending !== null}
          className={`rounded px-2 py-1 text-xs hover:opacity-80 disabled:opacity-40 ${variants[action] ?? 'bg-[var(--color-surface-sunken)] text-[var(--color-text)]'}`}
        >
          {pending === action ? `${labels[action] ?? action}…` : (labels[action] ?? action)}
        </button>
      ))}
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────

const PAGE_SIZE = 50

export function CareerOSCopilot() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [historyLimit, setHistoryLimit] = useState(PAGE_SIZE)
  const bottomRef = useRef<HTMLDivElement>(null)
  const workspaceContext = useWorkspaceContext()

  // Load history on first open
  const { data: history, refetch: refetchHistory } = useQuery({
    queryKey: ['conversation-history', historyLimit],
    queryFn: () => fetchHistory(historyLimit),
    enabled: open && !historyLoaded,
  })

  useEffect(() => {
    if (history && !historyLoaded) {
      const mapped: Message[] = [...history]
        .reverse()
        .map((m) => ({
          id: m.id,
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }))
      setMessages(mapped)
      setHistoryLoaded(true)
    }
  }, [history, historyLoaded])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const mutation = useMutation({
    mutationFn: ({ content }: { content: string }) =>
      sendMessage(content, workspaceContext as Record<string, unknown> | undefined),
    onSuccess: (data) => {
      setMessages((prev) => [
        ...prev,
        {
          id: data.messageId,
          role: 'assistant',
          content: data.response,
          ...(data.pendingApproval ? { pendingApproval: data.pendingApproval } : {}),
        },
      ])
    },
    onError: () => {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: 'Sorry, something went wrong. Please try again.',
        },
      ])
    },
  })

  const handleApprovalSettled = useCallback((messageId: string, action: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? {
              ...m,
              content: m.content + `\n\n✓ ${action.charAt(0).toUpperCase() + action.slice(1)}d.`,
              pendingApproval: undefined,
            }
          : m,
      ),
    )
  }, [])

  const handleLoadMore = useCallback(() => {
    const next = historyLimit + PAGE_SIZE
    setHistoryLimit(next)
    setHistoryLoaded(false)
    refetchHistory()
  }, [historyLimit, refetchHistory])

  const handleSend = useCallback(() => {
    const text = input.trim()
    if (!text || mutation.isPending) return
    setInput('')
    setMessages((prev) => [
      ...prev,
      { id: `u-${Date.now()}`, role: 'user', content: text },
    ])
    mutation.mutate({ content: text })
  }, [input, mutation])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <>
      {/* Floating trigger button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-text)] text-[var(--color-bg)] shadow-lg hover:opacity-90 transition-opacity"
        aria-label="Open CareerOS Copilot"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </button>

      {/* Overlay panel */}
      {open && (
        <div className="fixed bottom-20 right-6 z-50 flex w-[380px] flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
            <div>
              <p className="text-sm font-semibold">CareerOS Copilot</p>
              {workspaceContext && (
                <p className="text-xs text-[var(--color-muted)] capitalize">
                  Context: {workspaceContext.entityType as string}
                </p>
              )}
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-[var(--color-muted)] hover:text-[var(--color-text)]"
              aria-label="Close"
            >
              ×
            </button>
          </div>

          {/* Messages */}
          <div className="flex max-h-[420px] flex-col gap-3 overflow-y-auto p-4">
            {/* Load more: show when we have a full page (likely more exists) */}
            {messages.length >= historyLimit && (
              <button
                onClick={handleLoadMore}
                className="self-center rounded-md bg-[var(--color-surface-sunken)] px-3 py-1 text-xs text-[var(--color-muted)] hover:text-[var(--color-text)]"
              >
                Load more
              </button>
            )}
            {messages.length === 0 && (
              <p className="text-center text-xs text-[var(--color-muted)]">
                Ask me anything about your career — resumes, opportunities, gaps, strategy.
              </p>
            )}
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                    m.role === 'user'
                      ? 'bg-[var(--color-text)] text-[var(--color-bg)]'
                      : 'bg-[var(--color-surface-sunken)] text-[var(--color-text)]'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{m.content}</p>
                  {m.pendingApproval && (
                    <ApprovalCard
                      messageId={m.id}
                      approval={m.pendingApproval}
                      onSettled={handleApprovalSettled}
                    />
                  )}
                </div>
              </div>
            ))}
            {mutation.isPending && (
              <div className="flex justify-start">
                <div className="rounded-lg bg-[var(--color-surface-sunken)] px-3 py-2 text-sm text-[var(--color-muted)]">
                  Thinking...
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="flex items-center gap-2 border-t border-[var(--color-border)] p-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask CareerOS..."
              className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-[var(--color-text)] px-3 py-1.5 text-sm placeholder:text-[var(--color-faint)] focus:outline-none focus:border-[var(--color-muted)]"
              disabled={mutation.isPending}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || mutation.isPending}
              className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--color-text)] text-[var(--color-bg)] disabled:opacity-40"
              aria-label="Send"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  )
}
