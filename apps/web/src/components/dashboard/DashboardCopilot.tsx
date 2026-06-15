'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Send, RotateCcw } from 'lucide-react'
import { useMutation, useQuery } from '@tanstack/react-query'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
}

interface HistoryMessage {
  id: string
  role: string
  content: string
  channel: string
  createdAt: string
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'
function getToken() { return process.env.NEXT_PUBLIC_APP_SECRET ?? '' }

async function sendMessage(content: string, workspaceContext?: Record<string, unknown>) {
  const res = await fetch(`${API_URL}/conversations/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
    body: JSON.stringify({ content, channel: 'web', workspaceContext }),
  })
  if (!res.ok) throw new Error(`API ${res.status}`)
  return res.json() as Promise<{ messageId: string; response: string }>
}

async function fetchHistory(limit = 30): Promise<HistoryMessage[]> {
  const res = await fetch(`${API_URL}/conversations/history?limit=${limit}&channel=web`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  })
  if (!res.ok) return []
  return res.json()
}

// Render assistant message text, converting **bold** patterns to entity chips
function AssistantMessage({ content }: { content: string }) {
  const parts = content.split(/(\*\*[^*]+\*\*)/)
  return (
    <p className="whitespace-pre-wrap">
      {parts.map((part, i) => {
        const match = part.match(/^\*\*([^*]+)\*\*$/)
        if (match) {
          const entity = match[1]
          return (
            <Link
              key={i}
              href={`/career-intelligence?search=${encodeURIComponent(entity)}`}
              className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-[var(--color-violet-dim)] text-[var(--color-violet)] text-[11.5px] font-medium hover:underline mx-0.5 leading-none"
            >
              {entity}
            </Link>
          )
        }
        return <span key={i}>{part}</span>
      })}
    </p>
  )
}

const QUICK_ACTIONS = [
  { label: 'Analyze my opportunities', icon: '🎯' },
  { label: 'Generate a VVP', icon: '📄' },
  { label: 'Prepare for upcoming interview', icon: '🎤' },
  { label: 'What companies fit my profile?', icon: '🏢' },
]

export function DashboardCopilot() {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const pathname = usePathname()

  const { data: history } = useQuery({
    queryKey: ['conversation-history-dashboard', 30],
    queryFn: () => fetchHistory(30),
    enabled: !historyLoaded,
  })

  useEffect(() => {
    if (history && !historyLoaded) {
      const mapped: Message[] = [...history]
        .reverse()
        .map((m) => ({ id: m.id, role: m.role as 'user' | 'assistant', content: m.content }))
      setMessages(mapped)
      setHistoryLoaded(true)
    }
  }, [history, historyLoaded])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const mutation = useMutation({
    mutationFn: ({ content }: { content: string }) => sendMessage(content),
    onSuccess: (data) => {
      setMessages((prev) => [...prev, { id: data.messageId, role: 'assistant', content: data.response }])
    },
    onError: () => {
      setMessages((prev) => [
        ...prev,
        { id: `err-${Date.now()}`, role: 'assistant', content: 'Something went wrong. Please try again.' },
      ])
    },
  })

  const send = useCallback((text: string) => {
    const trimmed = text.trim()
    if (!trimmed || mutation.isPending) return
    setInput('')
    setMessages((prev) => [...prev, { id: `u-${Date.now()}`, role: 'user', content: trimmed }])
    mutation.mutate({ content: trimmed })
  }, [mutation])

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) }
  }

  const isEmpty = messages.length === 0 && !mutation.isPending

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-[var(--color-violet-dim)] flex items-center justify-center">
            <svg width="11" height="11" viewBox="0 0 20 20" fill="none" stroke="var(--color-violet)" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <span className="text-[13px] font-semibold text-[var(--color-text)]">CareerOS Copilot</span>
          <span className="text-[9px] font-bold uppercase tracking-wide text-[var(--color-violet)] bg-[var(--color-violet-dim)] px-1.5 py-0.5 rounded-full">
            BETA
          </span>
        </div>
        {messages.length > 0 && (
          <button
            onClick={() => { setMessages([]); setHistoryLoaded(false) }}
            className="text-[var(--color-faint)] hover:text-[var(--color-muted)] transition-colors"
            title="Clear chat"
          >
            <RotateCcw size={12} />
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto max-h-[220px] p-3 space-y-2.5">
        {isEmpty && (
          <div className="space-y-2.5">
            <p className="text-[12.5px] text-[var(--color-muted)] leading-relaxed">
              Hi! How can I help you advance your career today?
            </p>
            <div className="grid grid-cols-1 gap-1.5">
              {QUICK_ACTIONS.map(({ label, icon }) => (
                <button
                  key={label}
                  onClick={() => send(label)}
                  className="flex items-center gap-2 text-left px-2.5 py-2 rounded-md bg-[var(--color-bg)] border border-[var(--color-border)] text-[11.5px] text-[var(--color-text)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-elevated)] transition-colors"
                >
                  <span className="text-[13px]">{icon}</span>
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[88%] rounded-lg px-3 py-2 text-[12.5px] leading-relaxed ${
                m.role === 'user'
                  ? 'bg-[var(--color-text)] text-[var(--color-surface)]'
                  : 'bg-[var(--color-bg)] text-[var(--color-text)] border border-[var(--color-border)]'
              }`}
            >
              {m.role === 'assistant' ? (
                <AssistantMessage content={m.content} />
              ) : (
                <p className="whitespace-pre-wrap">{m.content}</p>
              )}
            </div>
          </div>
        ))}
        {mutation.isPending && (
          <div className="flex justify-start">
            <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-[12px] text-[var(--color-muted)]">
              <span className="inline-flex gap-0.5">
                <span className="animate-bounce" style={{ animationDelay: '0ms' }}>·</span>
                <span className="animate-bounce" style={{ animationDelay: '120ms' }}>·</span>
                <span className="animate-bounce" style={{ animationDelay: '240ms' }}>·</span>
              </span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 p-3 border-t border-[var(--color-border)]">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Ask anything…"
          disabled={mutation.isPending}
          className="flex-1 h-8 px-3 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] text-[12.5px] text-[var(--color-text)] placeholder:text-[var(--color-faint)] focus:outline-none focus:border-[var(--color-border-strong)] transition-colors"
        />
        <button
          onClick={() => send(input)}
          disabled={!input.trim() || mutation.isPending}
          className="h-8 w-8 rounded-md bg-[var(--color-violet)] text-white flex items-center justify-center hover:opacity-90 disabled:opacity-40 transition-opacity shrink-0"
        >
          <Send size={12} />
        </button>
      </div>

      {/* Footer note */}
      <p className="px-3 pb-2.5 text-[10px] text-[var(--color-faint)] text-center">
        Copilot uses your career graph and memory
      </p>
    </div>
  )
}
