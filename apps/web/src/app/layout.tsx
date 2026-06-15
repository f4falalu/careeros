import type { Metadata } from 'next'
import './globals.css'
import { Providers } from '@/providers'
import { Shell } from '@/components/layout/Shell'
import { FloatingCopilot } from '@/components/copilot/FloatingCopilot'

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
          <FloatingCopilot />
        </Providers>
      </body>
    </html>
  )
}
