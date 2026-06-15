'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Briefcase,
  GitBranch,
  Network,
  Star,
  Building2,
  FileText,
  Layers,
  Mail,
  Mic,
  Bot,
  MessageSquare,
  Settings,
  Sun,
  Moon,
  ChevronRight,
  User,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState, useEffect } from 'react'
import type { LucideIcon } from 'lucide-react'

type NavItem = { href: string; label: string; icon: LucideIcon; badge?: string }

const sections: { label: string; items: NavItem[] }[] = [
  {
    label: 'Opportunities',
    items: [
      { href: '/', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/jobs', label: 'Opportunities', icon: Briefcase },
      { href: '/opportunities', label: 'Applications', icon: GitBranch },
    ],
  },
  {
    label: 'Career Intelligence',
    items: [
      { href: '/career-intelligence', label: 'Career Intelligence', icon: Network },
      { href: '/profile', label: 'Skills & Profile', icon: Star },
      { href: '/companies', label: 'Companies', icon: Building2 },
    ],
  },
  {
    label: 'Workspace',
    items: [
      { href: '/resume', label: 'Resume Studio', icon: FileText },
      { href: '/vvp', label: 'VVP Workspace', icon: Layers },
      { href: '/outreach', label: 'Outreach Hub', icon: Mail },
      { href: '/interviews', label: 'Interview Prep', icon: Mic },
    ],
  },
  {
    label: 'AI & Automation',
    items: [
      { href: '/agents', label: 'Agents', icon: Bot },
    ],
  },
]

export function Sidebar() {
  const pathname = usePathname()
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    const stored = localStorage.getItem('theme') as 'light' | 'dark' | null
    if (stored) {
      setTheme(stored)
      document.documentElement.setAttribute('data-theme', stored)
    }
  }, [])

  function toggleTheme() {
    const next = theme === 'light' ? 'dark' : 'light'
    setTheme(next)
    document.documentElement.setAttribute('data-theme', next)
    localStorage.setItem('theme', next)
  }

  function isActive(href: string) {
    return href === '/' ? pathname === '/' : pathname.startsWith(href)
  }

  return (
    <aside className="flex flex-col w-[220px] shrink-0 border-r border-[var(--color-border)] bg-[var(--color-surface)] h-screen sticky top-0 z-20">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-[var(--color-border)]">
        <div className="w-7 h-7 rounded-[7px] bg-[var(--color-text)] flex items-center justify-center shrink-0">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
            <path d="M8 1L14.5 4.5V11.5L8 15L1.5 11.5V4.5L8 1Z" stroke="#ECFDF5" strokeWidth="1.5" strokeLinejoin="round"/>
            <circle cx="8" cy="8" r="2" fill="#10B981"/>
          </svg>
        </div>
        <span className="text-[15px] font-semibold tracking-tight text-[var(--color-text)]">CareerOS</span>
      </div>

      {/* Nav sections */}
      <nav className="flex-1 overflow-y-auto py-3 px-2.5 space-y-0.5">
        {sections.map((section) => (
          <div key={section.label} className="mb-1">
            <p className="px-2.5 pt-3 pb-1.5 text-[10px] font-600 uppercase tracking-[0.06em] text-[var(--color-faint)]">
              {section.label}
            </p>
            {section.items.map(({ href, label, icon: Icon, badge }) => {
              const active = isActive(href)
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    'flex items-center gap-2.5 px-2.5 py-[7px] rounded-md text-[13.5px] transition-colors duration-100 group',
                    active
                      ? 'bg-[var(--color-bg)] text-[var(--color-text)] font-medium border border-[var(--color-border)]'
                      : 'text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg)]',
                  )}
                >
                  <Icon
                    size={14}
                    strokeWidth={active ? 2 : 1.5}
                    className={active ? 'text-[var(--color-text)]' : 'text-[var(--color-faint)] group-hover:text-[var(--color-muted)]'}
                  />
                  <span className="flex-1 truncate">{label}</span>
                  {badge && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-[var(--color-amber-dim)] text-[var(--color-amber)]">
                      {badge}
                    </span>
                  )}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Bottom controls */}
      <div className="border-t border-[var(--color-border)]">
        {/* Settings + theme row */}
        <div className="flex items-center gap-1 px-3 py-2.5">
          <Link
            href="/settings"
            className={cn(
              'flex items-center gap-2 flex-1 px-2 py-1.5 rounded-md text-[13px] transition-colors',
              pathname === '/settings'
                ? 'text-[var(--color-text)] bg-[var(--color-bg)]'
                : 'text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg)]',
            )}
          >
            <Settings size={13} strokeWidth={1.5} />
            Settings
          </Link>
          <button
            onClick={toggleTheme}
            className="p-1.5 rounded-md text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg)] transition-colors"
            title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
          >
            {theme === 'light' ? <Moon size={13} strokeWidth={1.5} /> : <Sun size={13} strokeWidth={1.5} />}
          </button>
        </div>

        {/* User profile */}
        <Link
          href="/profile"
          className="flex items-center gap-3 px-4 py-3 border-t border-[var(--color-border)] hover:bg-[var(--color-bg)] transition-colors group"
        >
          <div className="w-8 h-8 rounded-full bg-[var(--color-text)] text-[var(--color-surface)] flex items-center justify-center text-[12px] font-semibold shrink-0">
            F
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium text-[var(--color-text)] truncate">Falalu A.</p>
            <p className="text-[11px] text-[var(--color-faint)]">View Profile</p>
          </div>
          <ChevronRight size={12} className="text-[var(--color-faint)] group-hover:text-[var(--color-muted)] transition-colors shrink-0" />
        </Link>
      </div>
    </aside>
  )
}
