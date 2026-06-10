'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { AutonomyConfig } from '@/types'
import { ShieldAlert, Loader2, CheckCircle2, AlertCircle, Bot } from 'lucide-react'
import { cn } from '@/lib/utils'

// Safe defaults — must mirror AutonomySchema on the API (agents/lib/autonomy.ts).
const DEFAULTS: AutonomyConfig = {
  autoApply: { enabled: false, requireConfirm: true, allowedSites: [], dailyLimit: 5 },
  scraping: { enabled: false, allowedDomains: [] },
  crmEnrichment: { enabled: true },
}

function withDefaults(raw: AutonomyConfig | Record<string, never> | undefined): AutonomyConfig {
  const a = (raw ?? {}) as Partial<AutonomyConfig>
  return {
    autoApply: { ...DEFAULTS.autoApply, ...(a.autoApply ?? {}) },
    scraping: { ...DEFAULTS.scraping, ...(a.scraping ?? {}) },
    crmEnrichment: { ...DEFAULTS.crmEnrichment, ...(a.crmEnrichment ?? {}) },
  }
}

function Toggle({
  checked,
  onChange,
  danger,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  danger?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
        checked
          ? danger
            ? 'bg-red-500'
            : 'bg-ink'
          : 'bg-[var(--color-border)]',
      )}
    >
      <span
        className={cn(
          'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
          checked ? 'translate-x-4' : 'translate-x-0.5',
        )}
      />
    </button>
  )
}

function Row({
  title,
  desc,
  children,
}: {
  title: string
  desc: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div>
        <p className="text-[13px] font-medium text-[var(--color-text)]">{title}</p>
        <p className="text-[12px] text-[var(--color-muted)] mt-0.5">{desc}</p>
      </div>
      <div className="pt-0.5">{children}</div>
    </div>
  )
}

function csv(list: string[]): string {
  return list.join(', ')
}
function parseCsv(s: string): string[] {
  return s.split(',').map((x) => x.trim()).filter(Boolean)
}

export function AutonomyPanel() {
  const [cfg, setCfg] = useState<AutonomyConfig | null>(null)
  const [sitesText, setSitesText] = useState('')
  const [domainsText, setDomainsText] = useState('')
  const [loading, setLoading] = useState(true)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    api.settings
      .get()
      .then((s) => {
        const a = withDefaults(s.autonomy)
        setCfg(a)
        setSitesText(csv(a.autoApply.allowedSites))
        setDomainsText(csv(a.scraping.allowedDomains))
      })
      .catch((err) => setErrorMsg(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  async function handleSave() {
    if (!cfg) return
    setSaveState('saving')
    setErrorMsg('')
    const payload: AutonomyConfig = {
      ...cfg,
      autoApply: { ...cfg.autoApply, allowedSites: parseCsv(sitesText) },
      scraping: { ...cfg.scraping, allowedDomains: parseCsv(domainsText) },
    }
    try {
      const saved = await api.settings.update({ autonomy: payload })
      const a = withDefaults(saved.autonomy)
      setCfg(a)
      setSitesText(csv(a.autoApply.allowedSites))
      setDomainsText(csv(a.scraping.allowedDomains))
      setSaveState('saved')
      setTimeout(() => setSaveState('idle'), 3000)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save')
      setSaveState('error')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[13px] text-[var(--color-muted)]">
        <Loader2 size={14} className="animate-spin" /> Loading autonomy settings…
      </div>
    )
  }

  if (!cfg) {
    return (
      <p className="text-[13px] text-red-600 flex items-center gap-1.5">
        <AlertCircle size={14} /> {errorMsg || 'Could not load settings.'}
      </p>
    )
  }

  const set = (next: Partial<AutonomyConfig>) => setCfg({ ...cfg, ...next })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[15px] font-medium text-[var(--color-text)] flex items-center gap-2">
            <Bot size={15} strokeWidth={1.5} />
            Agent Autonomy
          </h2>
          <p className="text-[13px] text-[var(--color-muted)] mt-0.5">
            Control what the agents are allowed to do on their own. Everything is off by default.
          </p>
        </div>
      </div>

      {/* Safety banner */}
      <div className="flex gap-2.5 text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded-sm px-4 py-3">
        <ShieldAlert size={16} className="shrink-0 mt-px text-amber-600" />
        <p>
          Auto-apply and scraping are powerful and carry account / terms-of-service risk. Keep the
          human-confirmation step on, restrict them to sites you trust, and review every action.
        </p>
      </div>

      {/* CRM enrichment — safe */}
      <section className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-sm px-4 divide-y divide-[var(--color-border)]">
        <Row
          title="Contact enrichment"
          desc="Fill in missing contact details from public web search. Low risk; never overwrites your data."
        >
          <Toggle
            checked={cfg.crmEnrichment.enabled}
            onChange={(v) => set({ crmEnrichment: { enabled: v } })}
          />
        </Row>
      </section>

      {/* Auto-apply — risky */}
      <section>
        <p className="text-[12px] font-semibold uppercase tracking-wide text-[var(--color-faint)] mb-1.5">
          Auto-apply
        </p>
        <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-sm px-4 divide-y divide-[var(--color-border)]">
          <Row title="Enable auto-apply" desc="Let the Apply agent submit applications for you.">
            <Toggle
              danger
              checked={cfg.autoApply.enabled}
              onChange={(v) => set({ autoApply: { ...cfg.autoApply, enabled: v } })}
            />
          </Row>
          <Row
            title="Require my confirmation"
            desc="Park each submission for one-click approval before anything is sent. Strongly recommended."
          >
            <Toggle
              checked={cfg.autoApply.requireConfirm}
              onChange={(v) => set({ autoApply: { ...cfg.autoApply, requireConfirm: v } })}
            />
          </Row>
          <div className="py-3 space-y-1.5">
            <label className="block text-[13px] font-medium text-[var(--color-text)]">
              Allowed sites
            </label>
            <input
              type="text"
              value={sitesText}
              onChange={(e) => setSitesText(e.target.value)}
              placeholder="greenhouse.io, lever.co, ashbyhq.com"
              className="w-full text-[13px] font-mono bg-[var(--color-surface)] border border-[var(--color-border)] rounded-sm px-3 py-2 text-[var(--color-text)] placeholder:text-[var(--color-faint)] focus:outline-none focus:border-ink"
            />
            <p className="text-[12px] text-[var(--color-faint)]">
              Comma-separated host suffixes. Auto-apply only runs on these. Empty = nothing allowed.
            </p>
          </div>
          <div className="py-3 space-y-1.5">
            <label className="block text-[13px] font-medium text-[var(--color-text)]">
              Daily limit
            </label>
            <input
              type="number"
              min={0}
              max={100}
              value={cfg.autoApply.dailyLimit}
              onChange={(e) =>
                set({
                  autoApply: {
                    ...cfg.autoApply,
                    dailyLimit: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                  },
                })
              }
              className="w-28 text-[13px] font-mono bg-[var(--color-surface)] border border-[var(--color-border)] rounded-sm px-3 py-2 text-[var(--color-text)] focus:outline-none focus:border-ink"
            />
            <p className="text-[12px] text-[var(--color-faint)]">
              Max applications auto-submitted per day.
            </p>
          </div>
        </div>
      </section>

      {/* Scraping — risky */}
      <section>
        <p className="text-[12px] font-semibold uppercase tracking-wide text-[var(--color-faint)] mb-1.5">
          Careers-page scraping
        </p>
        <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-sm px-4 divide-y divide-[var(--color-border)]">
          <Row
            title="Enable scraping"
            desc="Let the Scrape agent extract jobs from a careers page you point it at."
          >
            <Toggle
              danger
              checked={cfg.scraping.enabled}
              onChange={(v) => set({ scraping: { ...cfg.scraping, enabled: v } })}
            />
          </Row>
          <div className="py-3 space-y-1.5">
            <label className="block text-[13px] font-medium text-[var(--color-text)]">
              Allowed domains
            </label>
            <input
              type="text"
              value={domainsText}
              onChange={(e) => setDomainsText(e.target.value)}
              placeholder="acme.com, careers.acme.com"
              className="w-full text-[13px] font-mono bg-[var(--color-surface)] border border-[var(--color-border)] rounded-sm px-3 py-2 text-[var(--color-text)] placeholder:text-[var(--color-faint)] focus:outline-none focus:border-ink"
            />
            <p className="text-[12px] text-[var(--color-faint)]">
              Comma-separated host suffixes. Scraping only runs on these. Empty = nothing allowed.
            </p>
          </div>
        </div>
      </section>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saveState === 'saving'}
          className={cn(
            'inline-flex items-center gap-2 px-4 py-2 text-[13px] font-medium rounded-sm transition-colors',
            'bg-ink text-[var(--color-bg)] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed',
          )}
        >
          {saveState === 'saving' ? <Loader2 size={14} className="animate-spin" /> : null}
          {saveState === 'saving' ? 'Saving…' : 'Save autonomy settings'}
        </button>
        {saveState === 'saved' && (
          <span className="flex items-center gap-1.5 text-[13px] text-green-700">
            <CheckCircle2 size={14} /> Saved
          </span>
        )}
        {saveState === 'error' && (
          <span className="flex items-center gap-1.5 text-[13px] text-red-600">
            <AlertCircle size={14} /> {errorMsg}
          </span>
        )}
      </div>
    </div>
  )
}
