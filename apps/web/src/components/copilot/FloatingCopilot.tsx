'use client'
import { usePathname } from 'next/navigation'
import { CareerOSCopilot } from './CareerOSCopilot'

export function FloatingCopilot() {
  const pathname = usePathname()
  if (pathname === '/') return null
  return <CareerOSCopilot />
}
