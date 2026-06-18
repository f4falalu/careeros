'use client'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { Search, Plus, Bell } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

const PAGE_TITLES: Record<string, string> = {
  '/jobs': 'Opportunities',
  '/opportunities': 'Applications',
  '/resume': 'Resume Studio',
  '/vvp': 'VVP Workspace',
  '/outreach': 'Outreach Hub',
  '/interviews': 'Interview Prep',
  '/analytics': 'Career Graph',
  '/profile': 'Skills & Profile',
  '/companies': 'Companies',
  '/agents': 'AI Agents',
  '/settings': 'Settings',
}

export function Header() {
  const pathname = usePathname()
  const isDashboard = pathname === '/'
  const title = Object.entries(PAGE_TITLES).find(([p]) => pathname.startsWith(p))?.[1] ?? 'CareerOS'

  const [url, setUrl] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const qc = useQueryClient()

  const intake = useMutation({
    mutationFn: (jobUrl: string) =>
      api.intake.submit({ url: jobUrl, source_channel: 'web' }),
    onSuccess: () => {
      setUrl('')
      setAddOpen(false)
      qc.invalidateQueries({ queryKey: ['opportunities'] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
    },
  })

  return (
    <header className="flex items-center justify-between px-7 border-b border-[var(--color-border)] bg-[var(--color-surface)] sticky top-0 z-10 min-h-[68px]">
      {/* Left: greeting or page title */}
      {isDashboard ? (
        <div>
          <h1 className="text-[20px] font-semibold text-[var(--color-text)] leading-tight">
            {getGreeting()}, Falalu
          </h1>
          <p className="text-[12.5px] text-[var(--color-muted)] mt-0.5">
            Here&apos;s your career overview and what matters today.
          </p>
        </div>
      ) : (
        <h1 className="text-[17px] font-semibold text-[var(--color-text)]">{title}</h1>
      )}

      {/* Right: actions */}
      <div className="flex items-center gap-2">
        {/* Quick intake */}
        {addOpen ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (url) intake.mutate(url)
            }}
            className="flex items-center gap-2"
          >
            <input
              autoFocus
              type="url"
              placeholder="Paste job URL…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="h-8 w-64 px-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[13px] text-[var(--color-text)] placeholder:text-[var(--color-faint)] focus:outline-none focus:border-[var(--color-border-strong)] transition-colors"
            />
            <button
              type="submit"
              disabled={intake.isPending || !url}
              className="h-8 px-3 rounded-md bg-[var(--color-text)] text-[var(--color-surface)] text-[12.5px] font-medium disabled:opacity-50 hover:opacity-90 transition-opacity"
            >
              {intake.isPending ? 'Adding…' : 'Add'}
            </button>
            <button
              type="button"
              onClick={() => setAddOpen(false)}
              className="h-8 px-2.5 rounded-md text-[var(--color-muted)] hover:text-[var(--color-text)] text-[12.5px] transition-colors"
            >
              Cancel
            </button>
          </form>
        ) : (
          <button
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-1.5 h-8 px-3 rounded-md bg-[var(--color-text)] text-[var(--color-surface)] text-[12.5px] font-medium hover:opacity-90 transition-opacity"
          >
            <Plus size={13} />
            Add Job URL
          </button>
        )}

        {/* Search */}
        <button className="flex items-center gap-2 h-8 px-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)] text-[12.5px] hover:text-[var(--color-text)] hover:border-[var(--color-border-strong)] transition-colors min-w-[160px]">
          <Search size={13} strokeWidth={1.5} />
          <span className="flex-1 text-left text-[var(--color-faint)]">Search anything…</span>
          <kbd className="text-[10px] opacity-50 font-medium">⌘K</kbd>
        </button>

        {/* Notifications */}
        <button className="relative h-8 w-8 flex items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg)] transition-colors">
          <Bell size={14} strokeWidth={1.5} />
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-[var(--color-amber)] text-white text-[9px] font-bold rounded-full flex items-center justify-center">
            3
          </span>
        </button>
      </div>
    </header>
  )
}
