import type { Metadata } from 'next'
import './globals.css'
import { Providers } from '@/providers'
import { Shell } from '@/components/layout/Shell'
import { CareerOSCopilot } from '@/components/copilot/CareerOSCopilot'

export const metadata: Metadata = {
  title: 'CareerOS',
  description: 'AI-native career operating system',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Providers>
          <Shell>{children}</Shell>
          <CareerOSCopilot />
        </Providers>
      </body>
    </html>
  )
}
