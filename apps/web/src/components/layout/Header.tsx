'use client'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { Search, Plus } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

const titles: Record<string, string> = {
  '/': 'Dashboard',
  '/opportunities': 'Jobs',
  '/resume': 'Resume Studio',
  '/companies': 'Companies',
  '/agents': 'AI Agents',
}

export function Header() {
  const pathname = usePathname()
  const title = titles[pathname] ?? 'CareerOS'
  const [url, setUrl] = useState('')
  const [open, setOpen] = useState(false)
  const qc = useQueryClient()

  const intake = useMutation({
    mutationFn: (jobUrl: string) =>
      api.intake.submit({ url: jobUrl, source_channel: 'web' }),
    onSuccess: () => {
      setUrl('')
      setOpen(false)
      qc.invalidateQueries({ queryKey: ['opportunities'] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
    },
  })

  return (
    <header className="flex items-center justify-between px-8 py-4 border-b border-[var(--color-border)] bg-[var(--color-surface)] sticky top-0 z-10">
      <h1 className="text-[17px] font-semibold text-[var(--color-text)]">{title}</h1>

      <div className="flex items-center gap-3">
        {/* Quick intake */}
        {open ? (
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
              className="h-9 w-72 px-3 rounded-sm border border-[var(--color-border)] bg-[var(--color-surface)] text-[14px] text-[var(--color-text)] placeholder:text-[var(--color-faint)] focus:outline-none focus:border-[var(--color-muted)]"
            />
            <button
              type="submit"
              disabled={intake.isPending || !url}
              className="h-9 px-4 rounded-sm bg-[var(--color-text)] text-[var(--color-bg)] text-[13px] font-medium disabled:opacity-50 hover:opacity-90 transition-opacity"
            >
              {intake.isPending ? 'Adding…' : 'Add Job'}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-9 px-3 rounded-sm text-[var(--color-muted)] hover:text-[var(--color-text)] text-[13px]"
            >
              Cancel
            </button>
          </form>
        ) : (
          <button
            onClick={() => setOpen(true)}
            className="flex items-center gap-1.5 h-9 px-4 rounded-sm bg-[var(--color-text)] text-[var(--color-bg)] text-[13px] font-medium hover:opacity-90 transition-opacity"
          >
            <Plus size={14} />
            Add Job
          </button>
        )}

        <button className="flex items-center gap-2 h-9 px-3 rounded-sm border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)] text-[13px] hover:text-[var(--color-text)] transition-colors">
          <Search size={14} strokeWidth={1.5} />
          <span className="hidden sm:inline">Search</span>
          <kbd className="hidden sm:inline text-[11px] opacity-60">⌘K</kbd>
        </button>
      </div>
    </header>
  )
}
