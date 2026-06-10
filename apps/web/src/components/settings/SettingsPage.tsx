'use client'
import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import { Send, CheckCircle2, AlertCircle, Loader2, Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { JobBoardsPanel } from './JobBoardsPanel'
import { AutonomyPanel } from './AutonomyPanel'

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

function StatusBadge({ status }: { status: string }) {
  const connected = status === 'connected' || status === 'active'
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-[12px] font-medium px-2 py-0.5 rounded-full',
        connected
          ? 'bg-green-50 text-green-700 border border-green-200'
          : 'bg-[var(--color-bg)] text-[var(--color-muted)] border border-[var(--color-border)]',
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full', connected ? 'bg-green-500' : 'bg-[var(--color-faint)]')} />
      {connected ? 'Connected' : 'Not connected'}
    </span>
  )
}

export function SettingsPage() {
  const [token, setToken] = useState('')
  const [userId, setUserId] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [channelStatus, setChannelStatus] = useState<string>('disconnected')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.settings.channels.list().then((channels) => {
      const tg = channels.find((c) => c.channel === 'telegram')
      if (tg) {
        setChannelStatus(tg.status)
        const cfg = tg.config as Record<string, unknown>
        if (cfg.allowed_user_ids && Array.isArray(cfg.allowed_user_ids)) {
          setUserId((cfg.allowed_user_ids as string[]).join(', '))
        }
      }
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  async function handleSave() {
    if (!token && !userId) return
    setSaveState('saving')
    setErrorMsg('')
    try {
      const userIds = userId
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)

      const payload: { token?: string; allowed_user_ids?: string[]; enabled: boolean } = {
        enabled: true,
      }
      if (token) payload.token = token
      if (userIds.length > 0) payload.allowed_user_ids = userIds

      await api.settings.channels.saveTelegram(payload)
      setToken('')
      setChannelStatus('connected')
      setSaveState('saved')
      setTimeout(() => setSaveState('idle'), 3000)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save')
      setSaveState('error')
    }
  }

  return (
    <div className="flex-1 overflow-y-auto bg-[var(--color-bg)] min-h-screen">
      <div className="max-w-2xl mx-auto px-6 py-10 space-y-10">
        {/* Header */}
        <div>
          <h1 className="text-[22px] font-semibold text-[var(--color-text)]">Settings</h1>
          <p className="text-[14px] text-[var(--color-muted)] mt-1">
            Configure channels, integrations, and preferences.
          </p>
        </div>

        {/* Telegram section */}
        <section className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[15px] font-medium text-[var(--color-text)] flex items-center gap-2">
                <Send size={15} strokeWidth={1.5} />
                Telegram
              </h2>
              <p className="text-[13px] text-[var(--color-muted)] mt-0.5">
                Connect your Telegram bot to control CareerOS from chat.
              </p>
            </div>
            {!loading && <StatusBadge status={channelStatus} />}
          </div>

          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-sm p-5 space-y-4">
            {/* Setup instructions */}
            <div className="text-[13px] text-[var(--color-muted)] space-y-1 bg-[var(--color-bg)] rounded-sm px-4 py-3 border border-[var(--color-border)]">
              <p className="font-medium text-[var(--color-text)]">How to get your bot token</p>
              <ol className="list-decimal list-inside space-y-0.5 mt-1">
                <li>Open Telegram and search for <span className="font-mono text-[12px]">@BotFather</span></li>
                <li>Send <span className="font-mono text-[12px]">/newbot</span> and follow the prompts</li>
                <li>Copy the token BotFather gives you and paste it below</li>
                <li>Get your Telegram user ID from <span className="font-mono text-[12px]">@userinfobot</span></li>
              </ol>
            </div>

            {/* Bot token field */}
            <div className="space-y-1.5">
              <label className="block text-[13px] font-medium text-[var(--color-text)]">
                Bot Token
              </label>
              <div className="relative">
                <input
                  type={showToken ? 'text' : 'password'}
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="1234567890:ABCDEFxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  className="w-full text-[13px] font-mono bg-[var(--color-bg)] border border-[var(--color-border)] rounded-sm px-3 py-2 pr-9 text-[var(--color-text)] placeholder:text-[var(--color-faint)] focus:outline-none focus:border-ink"
                />
                <button
                  type="button"
                  onClick={() => setShowToken((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--color-faint)] hover:text-[var(--color-muted)]"
                >
                  {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <p className="text-[12px] text-[var(--color-faint)]">
                Leave blank to keep the existing token. Token is encrypted at rest.
              </p>
            </div>

            {/* User ID field */}
            <div className="space-y-1.5">
              <label className="block text-[13px] font-medium text-[var(--color-text)]">
                Your Telegram User ID
              </label>
              <input
                type="text"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="123456789"
                className="w-full text-[13px] font-mono bg-[var(--color-bg)] border border-[var(--color-border)] rounded-sm px-3 py-2 text-[var(--color-text)] placeholder:text-[var(--color-faint)] focus:outline-none focus:border-ink"
              />
              <p className="text-[12px] text-[var(--color-faint)]">
                Comma-separated if multiple. Only listed users can send commands to the bot.
              </p>
            </div>

            {/* Save button + feedback */}
            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={handleSave}
                disabled={saveState === 'saving' || (!token && !userId)}
                className={cn(
                  'inline-flex items-center gap-2 px-4 py-2 text-[13px] font-medium rounded-sm transition-colors',
                  'bg-ink text-[var(--color-bg)] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed',
                )}
              >
                {saveState === 'saving' ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Send size={14} />
                )}
                {saveState === 'saving' ? 'Saving…' : 'Save Telegram'}
              </button>

              {saveState === 'saved' && (
                <span className="flex items-center gap-1.5 text-[13px] text-green-700">
                  <CheckCircle2 size={14} />
                  Saved
                </span>
              )}
              {saveState === 'error' && (
                <span className="flex items-center gap-1.5 text-[13px] text-red-600">
                  <AlertCircle size={14} />
                  {errorMsg}
                </span>
              )}
            </div>
          </div>

          {/* Next step: start the bot */}
          <p className="text-[12px] text-[var(--color-faint)]">
            After saving, the bot will be available when the API is running with{' '}
            <span className="font-mono">TELEGRAM_BOT_TOKEN</span> set in your environment.
          </p>
        </section>

        {/* Job Boards section */}
        <section className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-sm p-5">
          <JobBoardsPanel />
        </section>

        {/* Agent Autonomy section (Phase 4) */}
        <section className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-sm p-5">
          <AutonomyPanel />
        </section>
      </div>
    </div>
  )
}
