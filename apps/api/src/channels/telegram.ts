import { Bot } from 'grammy'
import { eq, and } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { handleIntake, handleMenuAction } from '../orchestrator/index.js'
import { setTelegramBotInstance } from './notify.js'
import { conversationService } from '../services/index.js'

// In-memory session: tracks the last opportunityId per chat so numbered menu replies work.
const sessions = new Map<number, { opportunityId?: string }>()

async function getUserByChatId(chatId: string) {
  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.telegramUserId, chatId))
    .limit(1)
  return user ?? null
}

export function createTelegramBot(): Bot {
  const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN ?? '')

  // ── Account linking: /start TOKEN ─────────────────────────────────────────
  bot.command('start', async (ctx) => {
    const token = ctx.match?.trim()
    if (!token) {
      await ctx.reply(
        'Welcome to CareerOS!\n\nTo get started, open your CareerOS settings and click "Connect Telegram" to get your personal connection link.',
      )
      return
    }

    const now = new Date()
    const [linkToken] = await db
      .select()
      .from(schema.channelLinkTokens)
      .where(eq(schema.channelLinkTokens.token, token))
      .limit(1)

    if (!linkToken) {
      await ctx.reply('Invalid connection link. Please generate a new one from CareerOS Settings → Channels.')
      return
    }
    if (linkToken.usedAt) {
      await ctx.reply('This link has already been used. Generate a new one from CareerOS Settings → Channels.')
      return
    }
    if (now > linkToken.expiresAt) {
      await ctx.reply('This link has expired. Generate a new one from CareerOS Settings → Channels.')
      return
    }

    const telegramUserId = ctx.from.id.toString()
    const username = ctx.from.username ?? null

    // Link the account
    await db
      .update(schema.users)
      .set({ telegramUserId })
      .where(eq(schema.users.id, linkToken.userId))

    // Mark token as used
    await db
      .update(schema.channelLinkTokens)
      .set({ usedAt: now })
      .where(eq(schema.channelLinkTokens.id, linkToken.id))

    // Upsert channel_configs to track connected status and username
    const [existingConfig] = await db
      .select({ id: schema.channelConfigs.id })
      .from(schema.channelConfigs)
      .where(
        and(
          eq(schema.channelConfigs.userId, linkToken.userId),
          eq(schema.channelConfigs.channel, 'telegram'),
        ),
      )
      .limit(1)

    const configData = { chat_id: telegramUserId, username }

    if (existingConfig) {
      await db
        .update(schema.channelConfigs)
        .set({ status: 'connected', config: configData, enabled: true, lastCheckedAt: now })
        .where(eq(schema.channelConfigs.id, existingConfig.id))
    } else {
      await db.insert(schema.channelConfigs).values({
        userId: linkToken.userId,
        channel: 'telegram',
        status: 'connected',
        config: configData,
        enabled: true,
        lastCheckedAt: now,
      })
    }

    const greeting = username ? `@${username}` : 'there'
    await ctx.reply(
      `Welcome to CareerOS, ${greeting}!\n\nYour account is linked. You can now:\n• Send a job URL to analyze it\n• Ask career questions\n• Request resume tailoring\n• Receive agent updates`,
    )
  })

  // ── Auth guard: resolve user by linked Telegram ID ────────────────────────
  bot.use(async (ctx, next) => {
    const chatId = ctx.from?.id?.toString()
    if (!chatId) return

    const user = await getUserByChatId(chatId)
    if (!user) {
      await ctx.reply(
        'Your Telegram account is not linked to CareerOS yet.\n\nOpen CareerOS Settings → Channels and click "Connect Telegram" to get started.',
      )
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

    // Route all other text through ConversationService (handles intents including URL intake)
    const user = await getUserByChatId(chatId.toString())
    if (!user) {
      await ctx.reply('Please link your CareerOS account first. Use /start <token> from your CareerOS Settings → Channels page.')
      return
    }

    await ctx.replyWithChatAction('typing')

    try {
      const response = await conversationService.handleMessage(
        user.id,
        'telegram',
        text,
        undefined,
        chatId.toString(),
      )
      if (response.pendingApproval) {
        await ctx.reply(
          `${response.response}\n\nReply with "approve" or "reject" to proceed.`,
          { parse_mode: 'Markdown' },
        )
      } else {
        await ctx.reply(response.response, { parse_mode: 'Markdown' })
      }
    } catch (err) {
      console.error('[telegram] conversationService error:', err)
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
  setTelegramBotInstance(bot)
  bot.start({ onStart: (info) => console.log(`[telegram] bot started as @${info.username}`) })
}
