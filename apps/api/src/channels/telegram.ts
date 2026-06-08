import { Bot } from 'grammy'
import { handleIntake, handleMenuAction } from '../orchestrator/index.js'

const ALLOWED_IDS = (process.env.TELEGRAM_ALLOWED_USER_IDS ?? '').split(',').filter(Boolean)

// In-memory session: tracks the last opportunityId per chat so numbered menu replies work.
const sessions = new Map<number, { opportunityId?: string }>()

export function createTelegramBot(): Bot {
  const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN ?? '')

  // ── Auth guard ────────────────────────────────────────────────────────────
  bot.use(async (ctx, next) => {
    const uid = ctx.from?.id?.toString()
    if (!uid || (ALLOWED_IDS.length > 0 && !ALLOWED_IDS.includes(uid))) {
      await ctx.reply('Not authorized.')
      return
    }
    await next()
  })

  // ── Text messages ─────────────────────────────────────────────────────────
  bot.on('message:text', async (ctx) => {
    const text = ctx.message.text
    const chatId = ctx.chat.id
    const session = sessions.get(chatId) ?? {}

    // Menu reply: one or more numbers 1-5 separated by whitespace
    const menuPattern = /^[1-5](\s+[1-5])*$/
    if (menuPattern.test(text.trim()) && session.opportunityId) {
      const actionMap = [
        'tailor_resume',
        'build_vvp',
        'draft_outreach',
        'cover_letter',
        'mark_applied',
      ] as const
      const selected = text.trim().split(/\s+/).map(n => parseInt(n, 10))
      const actions = selected
        .map(n => actionMap[n - 1])
        .filter((a): a is (typeof actionMap)[number] => Boolean(a))

      await ctx.replyWithChatAction('typing')
      try {
        const result = await handleMenuAction({
          opportunityId: session.opportunityId,
          actions,
          sourceChannel: 'telegram',
        })
        await ctx.reply(result.message)
      } catch (err) {
        console.error('[telegram] handleMenuAction error:', err)
        await ctx.reply('Something went wrong processing your selection. Please try again.')
      }
      return
    }

    // URL detection — grab the first URL in the message
    const urlMatch = text.match(/https?:\/\/\S+/)
    await ctx.replyWithChatAction('typing')

    try {
      let result: Awaited<ReturnType<typeof handleIntake>>
      if (urlMatch) {
        result = await handleIntake({ url: urlMatch[0], sourceChannel: 'telegram' })
      } else {
        result = await handleIntake({ text, sourceChannel: 'telegram' })
      }
      sessions.set(chatId, { opportunityId: result.opportunityId })
      await ctx.reply(result.message, { parse_mode: 'Markdown' })
    } catch (err) {
      console.error('[telegram] handleIntake error:', err)
      await ctx.reply('Sorry, something went wrong. Please try again in a moment.')
    }
  })

  // ── Document (PDF) messages ───────────────────────────────────────────────
  bot.on('message:document', async (ctx) => {
    await ctx.replyWithChatAction('typing')
    try {
      const file = await ctx.getFile()
      const filePath = file.file_path ?? ''
      const result = await handleIntake({ filePath, sourceChannel: 'telegram' })
      sessions.set(ctx.chat.id, { opportunityId: result.opportunityId })
      await ctx.reply(result.message, { parse_mode: 'Markdown' })
    } catch (err) {
      console.error('[telegram] document handleIntake error:', err)
      await ctx.reply('Sorry, I could not process that document. Please try again.')
    }
  })

  return bot
}

export async function startTelegramBot(): Promise<void> {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.log('[telegram] TELEGRAM_BOT_TOKEN not set — bot not started')
    return
  }
  const bot = createTelegramBot()
  // bot.start() is fire-and-forget for long-polling; the returned promise never resolves in normal operation.
  bot.start({ onStart: (info) => console.log(`[telegram] bot started as @${info.username}`) })
}
