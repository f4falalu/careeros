'use client'
import { useState, useEffect, useCallback } from 'react'
import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  Zap,
  RotateCcw,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import type { ProviderName, ProviderConfig, AgentRoutingConfig, AgentRoute, ModelOption } from '@/lib/api'

// ─────────────────────────────────────────────────────────────
// Provider metadata
// ─────────────────────────────────────────────────────────────

const PROVIDERS: Array<{
  id: ProviderName
  name: string
  description: string
  hasBaseUrl: boolean
  placeholder: string
  keyPlaceholder: string
  docsUrl: string
}> = [
  {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'Unified gateway to 200+ models — Claude, GPT-4o, Gemini, Llama and more.',
    hasBaseUrl: false,
    placeholder: 'https://openrouter.ai/api/v1',
    keyPlaceholder: 'sk-or-v1-...',
    docsUrl: 'https://openrouter.ai/keys',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Direct access to Claude Opus, Sonnet and Haiku.',
    hasBaseUrl: false,
    placeholder: 'https://api.anthropic.com/v1',
    keyPlaceholder: 'sk-ant-...',
    docsUrl: 'https://console.anthropic.com/settings/keys',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT-4o, o3, and the full OpenAI model family.',
    hasBaseUrl: false,
    placeholder: 'https://api.openai.com/v1',
    keyPlaceholder: 'sk-...',
    docsUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'groq',
    name: 'Groq',
    description: 'Ultra-fast inference for Llama and Mixtral.',
    hasBaseUrl: false,
    placeholder: 'https://api.groq.com/openai/v1',
    keyPlaceholder: 'gsk_...',
    docsUrl: 'https://console.groq.com/keys',
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    description: 'Gemini 2.5 Pro and Flash via Google AI Studio.',
    hasBaseUrl: false,
    placeholder: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    keyPlaceholder: 'AIza...',
    docsUrl: 'https://aistudio.google.com/app/apikey',
  },
  {
    id: 'ollama',
    name: 'Ollama',
    description: 'Self-hosted local models running on your machine or VPS.',
    hasBaseUrl: true,
    placeholder: 'http://localhost:11434',
    keyPlaceholder: '(no key required)',
    docsUrl: 'https://ollama.com',
  },
]

// ─────────────────────────────────────────────────────────────
// Agent definitions for routing
// ─────────────────────────────────────────────────────────────

const AGENTS: Array<{ id: string; name: string; description: string }> = [
  { id: 'research',   name: 'Research',        description: 'Company & role deep research, SWOT, news.' },
  { id: 'resume',     name: 'Resume Writer',   description: 'Tailors your master resume to each job.' },
  { id: 'cover',      name: 'Cover Letter',    description: 'Drafts application emails and cover letters.' },
  { id: 'vvp',        name: 'Value Prop',      description: 'Builds your unique value proposition angles.' },
  { id: 'interview',  name: 'Interview Prep',  description: 'Generates briefs and mock Q&A.' },
  { id: 'outreach',   name: 'Outreach',        description: 'Crafts personalized recruiter messages.' },
  { id: 'followup',   name: 'Follow-up',       description: 'Writes follow-up sequences for sent outreach.' },
  { id: 'strategist', name: 'Strategist',      description: 'Analyzes your pipeline and recommends next steps.' },
  { id: 'match',      name: 'Job Matching',    description: 'Scores opportunity fit against your profile.' },
  { id: 'intake',     name: 'Intake',          description: 'Parses job links and descriptions into structured data.' },
  { id: 'enrich',     name: 'Enrichment',      description: 'Enriches contact profiles from public sources.' },
  { id: 'tracker',    name: 'Tracker',         description: 'Tracks pipeline status and nudges stale applications.' },
]

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const connected = status === 'connected'
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full',
      connected
        ? 'bg-green-50 text-green-700 border border-green-200'
        : 'bg-[var(--color-bg)] text-[var(--color-muted)] border border-[var(--color-border)]',
    )}>
      <span className={cn('w-1.5 h-1.5 rounded-full', connected ? 'bg-green-500' : 'bg-[var(--color-faint)]')} />
      {connected ? 'Connected' : 'Not connected'}
    </span>
  )
}

function SaveFeedback({ state, error }: { state: 'idle' | 'saving' | 'saved' | 'error'; error: string }) {
  if (state === 'saving') return <Loader2 size={13} className="animate-spin text-[var(--color-muted)]" />
  if (state === 'saved') return <span className="flex items-center gap-1 text-[12px] text-green-700"><CheckCircle2 size={12} /> Saved</span>
  if (state === 'error') return <span className="flex items-center gap-1 text-[12px] text-red-600"><AlertCircle size={12} /> {error}</span>
  return null
}

// ─────────────────────────────────────────────────────────────
// Provider card
// ─────────────────────────────────────────────────────────────

function ProviderCard({
  meta,
  config,
  onSave,
  onRemove,
}: {
  meta: typeof PROVIDERS[number]
  config: ProviderConfig | undefined
  onSave: (data: { provider: ProviderName; api_key?: string; base_url?: string; enabled?: boolean }) => Promise<void>
  onRemove: (id: string) => Promise<void>
}) {
  const [expanded, setExpanded] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState(config?.base_url ?? '')
  const [showKey, setShowKey] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const isConnected = config?.status === 'connected'

  async function handleSave() {
    if (!apiKey && !baseUrl && meta.id !== 'ollama') return
    setSaveState('saving')
    setErrorMsg('')
    try {
      const payload: { provider: ProviderName; api_key?: string; base_url?: string; enabled?: boolean } = {
        provider: meta.id,
        enabled: true,
      }
      if (apiKey) payload.api_key = apiKey
      if (baseUrl) payload.base_url = baseUrl
      await onSave(payload)
      setApiKey('')
      setSaveState('saved')
      setTimeout(() => setSaveState('idle'), 3000)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save')
      setSaveState('error')
    }
  }

  async function handleRemove() {
    if (!config) return
    setSaveState('saving')
    try {
      await onRemove(config.id)
      setSaveState('idle')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to remove')
      setSaveState('error')
    }
  }

  return (
    <div className="border border-[var(--color-border)] rounded-sm bg-[var(--color-bg)]">
      {/* Header row */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[var(--color-surface)] transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="flex flex-col">
            <span className="text-[13px] font-medium text-[var(--color-text)]">{meta.name}</span>
            <span className="text-[12px] text-[var(--color-muted)]">{meta.description}</span>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <StatusBadge status={isConnected ? 'connected' : 'disconnected'} />
          {isConnected && (
            <span className="text-[11px] font-mono text-[var(--color-faint)]">···{config.key_last4}</span>
          )}
          {expanded ? <ChevronUp size={14} className="text-[var(--color-faint)]" /> : <ChevronDown size={14} className="text-[var(--color-faint)]" />}
        </div>
      </button>

      {/* Expanded form */}
      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-[var(--color-border)] space-y-3">
          {/* Base URL (Ollama or advanced) */}
          {(meta.hasBaseUrl || meta.id === 'ollama') && (
            <div className="space-y-1">
              <label className="block text-[12px] font-medium text-[var(--color-text)]">Base URL</label>
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder={meta.placeholder}
                className="w-full text-[12px] font-mono bg-[var(--color-surface)] border border-[var(--color-border)] rounded-sm px-3 py-2 text-[var(--color-text)] placeholder:text-[var(--color-faint)] focus:outline-none focus:border-ink"
              />
            </div>
          )}

          {/* API key */}
          {meta.id !== 'ollama' && (
            <div className="space-y-1">
              <label className="block text-[12px] font-medium text-[var(--color-text)]">
                API Key
                {' — '}
                <a
                  href={meta.docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--color-muted)] hover:text-ink underline underline-offset-2"
                >
                  get one here
                </a>
              </label>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={isConnected ? `Leave blank to keep existing key (···${config?.key_last4})` : meta.keyPlaceholder}
                  className="w-full text-[12px] font-mono bg-[var(--color-surface)] border border-[var(--color-border)] rounded-sm px-3 py-2 pr-9 text-[var(--color-text)] placeholder:text-[var(--color-faint)] focus:outline-none focus:border-ink"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--color-faint)] hover:text-[var(--color-muted)]"
                >
                  {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
              <p className="text-[11px] text-[var(--color-faint)]">Encrypted at rest — only the last 4 characters are stored in plaintext.</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={handleSave}
              disabled={saveState === 'saving' || (!apiKey && !baseUrl && meta.id !== 'ollama')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded-sm bg-ink text-[var(--color-bg)] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
            >
              {saveState === 'saving' ? <Loader2 size={12} className="animate-spin" /> : null}
              {isConnected ? 'Update key' : 'Connect'}
            </button>

            {isConnected && (
              <button
                onClick={handleRemove}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded-sm text-red-600 border border-red-200 hover:bg-red-50 transition-colors"
              >
                Disconnect
              </button>
            )}

            <SaveFeedback state={saveState} error={errorMsg} />
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Agent routing row
// ─────────────────────────────────────────────────────────────

function AgentRoutingRow({
  agent,
  currentRoute,
  systemRec,
  connectedProviders,
  models,
  onLoadModels,
  onChange,
}: {
  agent: typeof AGENTS[number]
  currentRoute: AgentRoute | undefined
  systemRec: AgentRoute | undefined
  connectedProviders: ProviderName[]
  models: Record<string, ModelOption[]>
  onLoadModels: (provider: ProviderName) => void
  onChange: (agentId: string, route: AgentRoute | null) => void
}) {
  const isCustom = Boolean(currentRoute)
  const displayProvider = currentRoute?.provider ?? systemRec?.provider ?? 'openrouter'
  const displayModel = currentRoute?.model ?? systemRec?.model ?? ''

  function handleModeChange(e: React.ChangeEvent<HTMLSelectElement>) {
    if (e.target.value === 'default') {
      onChange(agent.id, null)
    } else {
      const rec = systemRec ?? { provider: connectedProviders[0] ?? 'openrouter' as ProviderName, model: '' }
      onChange(agent.id, { provider: rec.provider, model: rec.model })
    }
  }

  function handleProviderChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const provider = e.target.value as ProviderName
    onLoadModels(provider)
    onChange(agent.id, { provider, model: '' })
  }

  function handleModelChange(e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) {
    onChange(agent.id, { provider: currentRoute?.provider ?? displayProvider, model: e.target.value })
  }

  const providerModels = models[displayProvider] ?? []

  return (
    <div className="flex flex-col gap-2 py-3 border-b border-[var(--color-border)] last:border-0">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-[var(--color-text)]">{agent.name}</p>
          <p className="text-[11px] text-[var(--color-muted)] mt-0.5">{agent.description}</p>
        </div>
        <select
          value={isCustom ? 'custom' : 'default'}
          onChange={handleModeChange}
          className="shrink-0 text-[12px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-sm px-2 py-1 text-[var(--color-text)] focus:outline-none focus:border-ink"
        >
          <option value="default">System recommended</option>
          <option value="custom">Custom model</option>
        </select>
      </div>

      {/* System default hint */}
      {!isCustom && systemRec && (
        <div className="flex items-center gap-1.5 text-[11px] text-[var(--color-faint)]">
          <Zap size={10} />
          {systemRec.provider} / {systemRec.model}
        </div>
      )}

      {/* Custom route pickers */}
      {isCustom && (
        <div className="flex items-center gap-2 flex-wrap">
          {/* Provider */}
          <select
            value={currentRoute?.provider ?? ''}
            onChange={handleProviderChange}
            className="text-[12px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-sm px-2 py-1 text-[var(--color-text)] focus:outline-none focus:border-ink"
          >
            <option value="">Provider…</option>
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id} disabled={!connectedProviders.includes(p.id) && p.id !== 'openrouter'}>
                {p.name}{!connectedProviders.includes(p.id) && p.id !== 'openrouter' ? ' (not connected)' : ''}
              </option>
            ))}
          </select>

          {/* Model — dropdown if we have a list, text input otherwise */}
          {providerModels.length > 0 ? (
            <select
              value={currentRoute?.model ?? ''}
              onChange={handleModelChange}
              className="flex-1 min-w-[200px] text-[12px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-sm px-2 py-1 text-[var(--color-text)] focus:outline-none focus:border-ink"
            >
              <option value="">Select model…</option>
              {providerModels.map((m) => (
                <option key={m.id} value={m.id}>{m.name} ({m.id})</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={currentRoute?.model ?? ''}
              onChange={handleModelChange}
              placeholder={`e.g. ${systemRec?.model ?? 'model-id'}`}
              className="flex-1 min-w-[200px] text-[12px] font-mono bg-[var(--color-surface)] border border-[var(--color-border)] rounded-sm px-2 py-1 text-[var(--color-text)] placeholder:text-[var(--color-faint)] focus:outline-none focus:border-ink"
            />
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Main panel
// ─────────────────────────────────────────────────────────────

export function IntegrationsPanel() {
  const [providers, setProviders] = useState<ProviderConfig[]>([])
  const [routing, setRouting] = useState<AgentRoutingConfig | null>(null)
  const [localRoutes, setLocalRoutes] = useState<Record<string, AgentRoute | null>>({})
  const [defaultProvider, setDefaultProvider] = useState<ProviderName | null>(null)
  const [models, setModels] = useState<Record<string, ModelOption[]>>({})
  const [loading, setLoading] = useState(true)
  const [routingSaveState, setRoutingSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [routingError, setRoutingError] = useState('')

  const load = useCallback(async () => {
    try {
      const [pList, rConfig] = await Promise.all([
        api.settings.providers.list(),
        api.settings.agentRouting.get(),
      ])
      setProviders(pList)
      setRouting(rConfig)
      setDefaultProvider(rConfig.defaultProvider)
      // Initialise local routes from saved config
      const initial: Record<string, AgentRoute | null> = {}
      for (const agent of AGENTS) {
        initial[agent.id] = rConfig.agentRoutes[agent.id] ?? null
      }
      setLocalRoutes(initial)
    } catch { /* ignore — API may not be up in dev */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const connectedProviders = providers.filter((p) => p.status === 'connected').map((p) => p.provider)

  async function loadModels(provider: ProviderName) {
    if (models[provider]) return
    try {
      const res = await api.settings.models.list(provider)
      setModels((prev) => ({ ...prev, [provider]: res.models }))
    } catch { /* non-fatal */ }
  }

  async function handleProviderSave(data: Parameters<typeof api.settings.providers.save>[0]) {
    const saved = await api.settings.providers.save(data)
    setProviders((prev) => {
      const idx = prev.findIndex((p) => p.provider === saved.provider)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = saved
        return next
      }
      return [...prev, saved]
    })
  }

  async function handleProviderRemove(id: string) {
    await api.settings.providers.remove(id)
    setProviders((prev) => prev.filter((p) => p.id !== id))
  }

  function handleRouteChange(agentId: string, route: AgentRoute | null) {
    setLocalRoutes((prev) => ({ ...prev, [agentId]: route }))
  }

  async function saveRouting() {
    setRoutingSaveState('saving')
    setRoutingError('')
    try {
      const agentRoutes: Record<string, AgentRoute> = {}
      for (const [id, route] of Object.entries(localRoutes)) {
        if (route?.provider && route?.model) agentRoutes[id] = route
      }
      const saved = await api.settings.agentRouting.save({
        defaultProvider: defaultProvider ?? undefined,
        agentRoutes,
      })
      setRouting(saved)
      setRoutingSaveState('saved')
      setTimeout(() => setRoutingSaveState('idle'), 3000)
    } catch (err) {
      setRoutingError(err instanceof Error ? err.message : 'Failed to save')
      setRoutingSaveState('error')
    }
  }

  function resetRouting() {
    if (!routing) return
    const reset: Record<string, AgentRoute | null> = {}
    for (const agent of AGENTS) reset[agent.id] = routing.agentRoutes[agent.id] ?? null
    setLocalRoutes(reset)
    setDefaultProvider(routing.defaultProvider)
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[13px] text-[var(--color-muted)] py-6">
        <Loader2 size={14} className="animate-spin" />
        Loading integrations…
      </div>
    )
  }

  return (
    <div className="space-y-10">
      {/* ── AI Providers ─────────────────────────────────────── */}
      <section className="space-y-4">
        <div>
          <h2 className="text-[15px] font-medium text-[var(--color-text)]">AI Providers</h2>
          <p className="text-[13px] text-[var(--color-muted)] mt-0.5">
            Add your own API keys. Keys are encrypted at rest and never sent anywhere except the provider's own endpoint.
          </p>
        </div>

        <div className="space-y-2">
          {PROVIDERS.map((meta) => {
            const config = providers.find((p) => p.provider === meta.id)
            return (
              <ProviderCard
                key={meta.id}
                meta={meta}
                config={config}
                onSave={handleProviderSave}
                onRemove={handleProviderRemove}
              />
            )
          })}
        </div>
      </section>

      {/* ── Agent Routing ─────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[15px] font-medium text-[var(--color-text)]">Agent Routing</h2>
            <p className="text-[13px] text-[var(--color-muted)] mt-0.5">
              Assign a specific model to each agent, or leave on{' '}
              <span className="font-medium">System recommended</span> to let CareerOS pick the best model for each task.
            </p>
          </div>
        </div>

        {/* Default provider */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-sm p-4 space-y-2">
          <label className="block text-[12px] font-medium text-[var(--color-text)]">Default provider</label>
          <p className="text-[11px] text-[var(--color-muted)]">
            Used as the fallback provider for agents set to "System recommended" when no custom route is set.
          </p>
          <select
            value={defaultProvider ?? ''}
            onChange={(e) => setDefaultProvider((e.target.value as ProviderName) || null)}
            className="text-[12px] bg-[var(--color-bg)] border border-[var(--color-border)] rounded-sm px-3 py-1.5 text-[var(--color-text)] focus:outline-none focus:border-ink"
          >
            <option value="">None (use system recommended per-agent)</option>
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        {/* Per-agent routing */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-sm px-4 pt-2 pb-0">
          {AGENTS.map((agent) => (
            <AgentRoutingRow
              key={agent.id}
              agent={agent}
              currentRoute={localRoutes[agent.id] ?? undefined}
              systemRec={routing?.systemRecommended[agent.id]}
              connectedProviders={connectedProviders}
              models={models}
              onLoadModels={loadModels}
              onChange={handleRouteChange}
            />
          ))}
        </div>

        {/* Save routing */}
        <div className="flex items-center gap-3">
          <button
            onClick={saveRouting}
            disabled={routingSaveState === 'saving'}
            className="inline-flex items-center gap-2 px-4 py-2 text-[13px] font-medium rounded-sm bg-ink text-[var(--color-bg)] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            {routingSaveState === 'saving' && <Loader2 size={13} className="animate-spin" />}
            Save routing
          </button>
          <button
            onClick={resetRouting}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium rounded-sm text-[var(--color-muted)] border border-[var(--color-border)] hover:bg-[var(--color-surface)] transition-colors"
          >
            <RotateCcw size={12} />
            Discard changes
          </button>
          <SaveFeedback state={routingSaveState} error={routingError} />
        </div>
      </section>
    </div>
  )
}
