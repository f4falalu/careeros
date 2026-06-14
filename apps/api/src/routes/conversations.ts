import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { conversationService } from '../services/index.js'

const app = new Hono()

// POST /conversations/message
// Send a message; receives intent-routed reply + optional approvalCard
app.post('/conversations/message', async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>

  const content = typeof body.content === 'string' ? body.content : ''
  if (!content) return c.json({ error: 'content is required' }, 400)

  const channel = (body.channel as string | undefined) ?? 'web'
  const externalThreadId = (body.externalThreadId as string | undefined) ?? null
  const workspaceContext = (body.workspaceContext as Record<string, unknown> | undefined) ?? undefined

  const response = await conversationService.handleMessage(
    userId,
    channel as 'web' | 'telegram' | 'whatsapp',
    content,
    workspaceContext as { entityType?: string; entityId?: string } | undefined,
    externalThreadId ?? undefined,
  )

  return c.json(response)
})

// GET /conversations/history?limit=20&channel=web
app.get('/conversations/history', async (c) => {
  const userId = c.get('userId')
  const limit = Math.min(parseInt(c.req.query('limit') ?? '50', 10), 100)
  const channel = c.req.query('channel') as 'web' | 'telegram' | 'whatsapp' | undefined

  const messages = await conversationService.getHistory(userId, { limit, channel })
  return c.json(messages)
})

// POST /conversations/approve
// body: { messageId: string, action: 'approve'|'review'|'reject', entityId: string, entityType: string }
app.post('/conversations/approve', async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>
  const { messageId, action, entityId, entityType } = body as {
    messageId?: string
    action?: string
    entityId?: string
    entityType?: string
  }

  if (!messageId || !action || !entityId || !entityType) {
    return c.json({ error: 'messageId, action, entityId, and entityType are required' }, 400)
  }

  if (action === 'reject') {
    console.info('[approve] rejected', { userId, entityType, entityId, messageId })
    return c.json({ success: true, action: 'rejected' })
  }

  if (action !== 'approve') {
    return c.json({ success: true, action: 'review' })
  }

  // Mutate entity state based on type
  switch (entityType) {
    case 'resume':
      await db
        .update(schema.resumeVersions)
        .set({ validated: true })
        .where(eq(schema.resumeVersions.id, entityId))
      break
    case 'outreach':
      await db
        .update(schema.outreachMessages)
        .set({ state: 'approved' })
        .where(eq(schema.outreachMessages.id, entityId))
      break
    case 'vvp':
      // VVP approval: mark it as the active artifact (no separate status field; log only)
      console.info('[approve] VVP approved', { userId, entityId })
      break
    case 'apply': {
      // Re-queue the apply agent for the opportunityId
      await conversationService.approveTask(userId, entityId)
      break
    }
    default:
      console.info('[approve] unknown entityType', { entityType, entityId })
  }

  return c.json({ success: true, action: 'approved', entityType, entityId })
})

export { app as conversationRoutes }
