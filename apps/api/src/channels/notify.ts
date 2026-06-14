import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import type { Bot } from 'grammy'

let _telegramBot: Bot | null = null

export function setTelegramBotInstance(bot: Bot): void {
  _telegramBot = bot
}

/**
 * Sends a message to all channels the user has connected.
 * Failures are logged and swallowed — notification delivery is best-effort.
 */
export async function notifyUser(userId: string, message: string): Promise<void> {
  const [user] = await db
    .select({ telegramUserId: schema.users.telegramUserId, whatsappNumber: schema.users.whatsappNumber })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1)

  if (!user) return

  const sends: Promise<void>[] = []

  if (user.telegramUserId && _telegramBot) {
    sends.push(
      _telegramBot.api
        .sendMessage(user.telegramUserId, message, { parse_mode: 'Markdown' })
        .then(() => {})
        .catch((err: unknown) => {
          console.error('[notify] Telegram sendMessage failed:', err)
        }),
    )
  }

  if (user.whatsappNumber) {
    // WhatsApp outbound not yet implemented — pending WhatsApp bot receiver
    console.log(`[notify] WhatsApp outbound not yet implemented (user ${userId})`)
  }

  await Promise.all(sends)
}

/**
 * Returns a user-facing notification message for a completed (or approval-gated) task.
 * Returns null when the agent does not warrant a proactive notification.
 */
export function buildTaskNotification(
  agentName: string,
  status: string,
  output: Record<string, unknown>,
): string | null {
  if (status === 'needs_approval') {
    return '⏳ An agent action needs your approval.\n\nOpen CareerOS → Tasks to review.'
  }

  if (status !== 'succeeded') return null

  switch (agentName) {
    case 'intake': {
      const ext = output.extraction as { company_name?: string; role_title?: string } | undefined
      if (!ext?.company_name || !ext?.role_title) return null
      const menu = '1 Tailor resume  |  2 Build VVP  |  3 Draft outreach  |  4 Cover letter  |  5 Mark applied  |  6 Prep interview'
      return `*${ext.company_name} · ${ext.role_title}*\n\nJob saved to your pipeline.\n\n${menu}`
    }
    case 'resume':
      return '✓ Your tailored resume is ready — open CareerOS to review and download.'
    case 'cover':
      return '✓ Your cover letter is ready — open CareerOS to review and edit.'
    case 'outreach':
      return '✓ Your outreach message is drafted — open CareerOS to approve before sending.'
    default:
      return null
  }
}
