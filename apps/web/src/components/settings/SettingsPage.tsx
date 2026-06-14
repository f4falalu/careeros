'use client'
import { useState, useEffect, useRef } from 'react'
import { api } from '@/lib/api'
import { CheckCircle2, AlertCircle, Loader2, Link2, Link2Off } from 'lucide-react'
import { cn } from '@/lib/utils'
import { JobBoardsPanel } from './JobBoardsPanel'
import { AutonomyPanel } from './AutonomyPanel'
import { IntegrationsPanel } from './IntegrationsPanel'

type Tab = 'integrations' | 'channels' | 'job-boards' | 'autonomy'

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'integrations', label: 'AI & Integrations' },
  { id: 'channels',     label: 'Channels' },
  { id: 'job-boards',   label: 'Job Boards' },
  { id: 'autonomy',     label: 'Autonomy' },
]

function StatusBadge({ status }: { status: string }) {
  const connected = status === 'connected'
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 text-[12px] font-medium px-2 py-0.5 rounded-full',
      connected
        ? 'bg-green-50 text-green-700 border border-green-200'
        : 'bg-[var(--color-bg)] text-[var(--color-muted)] border border-[var(--color-border)]',
    )}>
      <span className={cn('w-1.5 h-1.5 rounded-full', connected ? 'bg-green-500' : 'bg-[var(--color-faint)]')} />
      {connected ? 'Connected' : 'Not connected'}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────
// Single channel card (Telegram or WhatsApp)
// ─────────────────────────────────────────────────────────────

interface ChannelInfo {
  id: 'telegram' | 'whatsapp'
  label: string
  description: string
  icon: string
  openLabel: string
}

const CHANNELS: ChannelInfo[] = [
  {
    id: 'telegram',
    label: 'Telegram',
    description: 'Send job links, ask questions, and receive agent updates through @CareerOSBot.',
    icon: '✈',
    openLabel: 'Open in Telegram',
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    description: 'Interact with CareerOS agents through the official CareerOS WhatsApp number.',
    icon: '💬',
    openLabel: 'Open in WhatsApp',
  },
]

type Phase = 'idle' | 'linking' | 'connected' | 'error'

interface ChannelState {
  phase: Phase
  connectedAs: string | null
  deepLink: string | null
  errorMsg: string
}

function ChannelCard({
  info,
  state,
  onConnect,
  onDisconnect,
}: {
  info: ChannelInfo
  state: ChannelState
  onConnect: () => void
  onDisconnect: () => void
}) {
  const [copied, setCopied] = useState(false)

  function copyLink() {
    if (!state.deepLink) return
    navigator.clipboard.writeText(state.deepLink).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="border border-[var(--color-border)] rounded-sm bg-[var(--color-bg)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="text-[18px] leading-none">{info.icon}</span>
          <div>
            <p className="text-[13px] font-medium text-[var(--color-text)]">{info.label}</p>
            <p className="text-[12px] text-[var(--color-muted)] mt-0.5">{info.description}</p>
          </div>
        </div>
        <div className="shrink-0 ml-4">
          <StatusBadge status={state.phase === 'connected' ? 'connected' : 'disconnected'} />
        </div>
      </div>

      {/* Connected state */}
      {state.phase === 'connected' && (
        <div className="px-4 pb-4 border-t border-[var(--color-border)] pt-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[13px] text-green-700">
            <CheckCircle2 size={14} />
            {state.connectedAs ? `Connected as ${state.connectedAs}` : 'Connected'}
          </div>
          <button
            onClick={onDisconnect}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded-sm text-red-600 border border-red-200 hover:bg-red-50 transition-colors"
          >
            <Link2Off size={12} />
            Disconnect
          </button>
        </div>
      )}

      {/* Linking state — show deep link + polling */}
      {state.phase === 'linking' && state.deepLink && (
        <div className="px-4 pb-4 border-t border-[var(--color-border)] pt-3 space-y-3">
          <p className="text-[13px] text-[var(--color-text)]">
            Open the link below and send the message to link your account.
          </p>
          <a
            href={state.deepLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full px-4 py-2.5 text-[13px] font-medium rounded-sm bg-ink text-[var(--color-bg)] hover:opacity-90 transition-opacity"
          >
            <Link2 size={14} />
            {info.openLabel}
          </a>
          <button
            onClick={copyLink}
            className="w-full text-left px-3 py-2 text-[11px] font-mono text-[var(--color-muted)] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-sm hover:border-[var(--color-muted)] truncate transition-colors"
          >
            {copied ? 'Copied!' : state.deepLink}
          </button>
          <div className="flex items-center gap-2 text-[12px] text-[var(--color-muted)]">
            <Loader2 size={12} className="animate-spin shrink-0" />
            Waiting for connection… (link expires in 15 minutes)
          </div>
        </div>
      )}

      {/* Idle state — connect button */}
      {state.phase === 'idle' && (
        <div className="px-4 pb-4 border-t border-[var(--color-border)] pt-3">
          <button
            onClick={onConnect}
            className="inline-flex items-center gap-2 px-4 py-2 text-[13px] font-medium rounded-sm bg-ink text-[var(--color-bg)] hover:opacity-90 transition-opacity"
          >
            <Link2 size={14} />
            Connect {info.label}
          </button>
        </div>
      )}

      {/* Error state */}
      {state.phase === 'error' && (
        <div className="px-4 pb-4 border-t border-[var(--color-border)] pt-3 space-y-2">
          <p className="flex items-center gap-1.5 text-[13px] text-red-600">
            <AlertCircle size={14} />
            {state.errorMsg}
          </p>
          <button
            onClick={onConnect}
            className="inline-flex items-center gap-2 px-4 py-2 text-[13px] font-medium rounded-sm bg-ink text-[var(--color-bg)] hover:opacity-90 transition-opacity"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Channels panel
// ─────────────────────────────────────────────────────────────

function ChannelsPanel() {
  const [loading, setLoading] = useState(true)
  const [states, setStates] = useState<Record<string, ChannelState>>({
    telegram: { phase: 'idle', connectedAs: null, deepLink: null, errorMsg: '' },
    whatsapp: { phase: 'idle', connectedAs: null, deepLink: null, errorMsg: '' },
  })

  // Polling refs — one per channel, cleared when connected or unmounted
  const pollRefs = useRef<Record<string, ReturnType<typeof setInterval>>>({})

  useEffect(() => {
    api.settings.channels.list().then((channels) => {
      setStates((prev) => {
        const next = { ...prev }
        for (const ch of channels) {
          next[ch.channel] = {
            phase: ch.status === 'connected' ? 'connected' : 'idle',
            connectedAs: ch.connected_as,
            deepLink: null,
            errorMsg: '',
          }
        }
        return next
      })
    }).catch(() => {}).finally(() => setLoading(false))

    return () => {
      for (const id of Object.values(pollRefs.current)) clearInterval(id)
    }
  }, [])

  function startPolling(channel: string) {
    if (pollRefs.current[channel]) clearInterval(pollRefs.current[channel])
    pollRefs.current[channel] = setInterval(async () => {
      try {
        const channels = await api.settings.channels.list()
        const ch = channels.find((c) => c.channel === channel)
        if (ch?.status === 'connected') {
          clearInterval(pollRefs.current[channel])
          delete pollRefs.current[channel]
          setStates((prev) => ({
            ...prev,
            [channel]: { phase: 'connected', connectedAs: ch.connected_as, deepLink: null, errorMsg: '' },
          }))
        }
      } catch { /* ignore polling errors */ }
    }, 3000)
  }

  async function handleConnect(channel: string) {
    try {
      const { deep_link } = await api.settings.channels.connect(channel)
      setStates((prev) => ({
        ...prev,
        [channel]: { phase: 'linking', connectedAs: null, deepLink: deep_link, errorMsg: '' },
      }))
      startPolling(channel)
    } catch (err) {
      setStates((prev) => ({
        ...prev,
        [channel]: {
          ...prev[channel],
          phase: 'error',
          errorMsg: err instanceof Error ? err.message : 'Failed to generate connection link',
        },
      }))
    }
  }

  async function handleDisconnect(channel: string) {
    try {
      await api.settings.channels.disconnect(channel)
      setStates((prev) => ({
        ...prev,
        [channel]: { phase: 'idle', connectedAs: null, deepLink: null, errorMsg: '' },
      }))
    } catch (err) {
      setStates((prev) => ({
        ...prev,
        [channel]: {
          ...prev[channel],
          phase: 'error',
          errorMsg: err instanceof Error ? err.message : 'Failed to disconnect',
        },
      }))
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[13px] text-[var(--color-muted)] py-6">
        <Loader2 size={14} className="animate-spin" />
        Loading channels…
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[15px] font-medium text-[var(--color-text)]">Communication Channels</h2>
        <p className="text-[13px] text-[var(--color-muted)] mt-0.5">
          Connect your messaging accounts. All channels share the same workspace — jobs, resumes, and agent activity are always in sync.
        </p>
      </div>
      <div className="space-y-3">
        {CHANNELS.map((info) => (
          <ChannelCard
            key={info.id}
            info={info}
            state={states[info.id] ?? { phase: 'idle', connectedAs: null, deepLink: null, errorMsg: '' }}
            onConnect={() => handleConnect(info.id)}
            onDisconnect={() => handleDisconnect(info.id)}
          />
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('integrations')

  return (
    <div className="flex-1 overflow-y-auto bg-[var(--color-bg)] min-h-screen">
      <div className="max-w-2xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-[22px] font-semibold text-[var(--color-text)]">Settings</h1>
          <p className="text-[14px] text-[var(--color-muted)] mt-1">
            Configure AI providers, agent routing, channels, and preferences.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 border-b border-[var(--color-border)] mb-8">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'px-4 py-2 text-[13px] font-medium border-b-2 -mb-px transition-colors',
                activeTab === tab.id
                  ? 'border-ink text-[var(--color-text)]'
                  : 'border-transparent text-[var(--color-muted)] hover:text-[var(--color-text)]',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'integrations' && <IntegrationsPanel />}

        {activeTab === 'channels' && <ChannelsPanel />}

        {activeTab === 'job-boards' && (
          <section className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-sm p-5">
            <JobBoardsPanel />
          </section>
        )}

        {activeTab === 'autonomy' && (
          <section className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-sm p-5">
            <AutonomyPanel />
          </section>
        )}
      </div>
    </div>
  )
}
