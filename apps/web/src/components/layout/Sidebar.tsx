'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Briefcase,
  FileText,
  Building2,
  Bot,
  Settings,
  Zap,
  Layers,
  Mail,
  Mic,
  BarChart2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

type NavItem = { href: string; label: string; icon: LucideIcon; disabled?: boolean }

const nav: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/opportunities', label: 'Jobs', icon: Briefcase },
  { href: '/resume', label: 'Resume Studio', icon: FileText },
  { href: '/vvp', label: 'VVP Workspace', icon: Layers },
  { href: '/outreach', label: 'Outreach Hub', icon: Mail },
  { href: '/interviews', label: 'Interview Center', icon: Mic },
  { href: '/analytics', label: 'Analytics', icon: BarChart2 },
  { href: '/companies', label: 'Companies', icon: Building2 },
  { href: '/agents', label: 'AI Agents', icon: Bot },
]

const secondary: NavItem[] = [
  { href: '/settings', label: 'Settings', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="flex flex-col w-[260px] shrink-0 border-r border-[var(--color-border)] bg-[var(--color-surface)] h-screen sticky top-0">
      {/* Wordmark */}
      <div className="flex items-center gap-2 px-6 py-5 border-b border-[var(--color-border)]">
        <div className="w-7 h-7 rounded-sm bg-ink flex items-center justify-center">
          <Zap size={14} className="text-[var(--color-bg)]" />
        </div>
        <span className="text-[15px] font-semibold tracking-tight text-[var(--color-text)]">CareerOS</span>
      </div>

      {/* Main nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        <p className="px-3 pb-2 text-[11px] font-medium uppercase tracking-widest text-[var(--color-faint)]">
          Main Menu
        </p>
        {nav.map(({ href, label, icon: Icon, disabled }) => {
          const active = pathname === href
          return (
            <Link
              key={href}
              href={disabled ? '#' : href}
              aria-disabled={disabled}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-sm text-[14px] transition-colors duration-150',
                active
                  ? 'bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-text)] font-medium'
                  : 'text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg)]',
                disabled && 'opacity-40 cursor-not-allowed pointer-events-none',
              )}
            >
              <Icon size={16} strokeWidth={1.5} />
              {label}
              {disabled && (
                <span className="ml-auto text-[10px] font-medium text-[var(--color-faint)] uppercase tracking-wide">
                  Soon
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Secondary nav */}
      <div className="px-3 py-3 border-t border-[var(--color-border)] space-y-0.5">
        {secondary.map(({ href, label, icon: Icon, disabled }) => (
          <Link
            key={href}
            href={disabled ? '#' : href}
            aria-disabled={disabled}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-sm text-[14px] transition-colors duration-150 text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg)]',
              disabled && 'opacity-40 cursor-not-allowed pointer-events-none',
            )}
          >
            <Icon size={16} strokeWidth={1.5} />
            {label}
          </Link>
        ))}
      </div>
    </aside>
  )
}
