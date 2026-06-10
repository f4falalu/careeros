import { Hono } from 'hono'
import { z } from 'zod'
import { and, desc, eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { enqueueAgent } from '../workers/queue.js'

const app = new Hono()

const VALID_CHANNELS = ['email', 'linkedin', 'telegram', 'whatsapp', 'other'] as const
const VALID_ROLES = ['recruiter', 'hiring_manager', 'founder', 'referral', 'other'] as const

const DraftOutreachSchema = z.object({
  contact_role: z.enum(VALID_ROLES).default('recruiter'),
  channel: z.enum(VALID_CHANNELS).default('email'),
  contact_id: z.string().uuid().optional(),
})

// ── POST /opportunities/:id/outreach ──────────────────────────
// Enqueues the outreach agent to draft a message for the opportunity.
app.post('/opportunities/:id/outreach', async (c) => {
  const userId = c.get('userId')
  const opportunityId = c.req.param('id')

  let body: z.infer<typeof DraftOutreachSchema>
  try {
    body = DraftOutreachSchema.parse(await c.req.json())
  } catch (err) {
    return c.json({ code: 'validation_error', message: String(err) }, 400)
  }

  const [opportunity] = await db
    .select()
    .from(schema.opportunities)
    .where(and(eq(schema.opportunities.id, opportunityId), eq(schema.opportunities.userId, userId)))
    .limit(1)

  if (!opportunity) {
    return c.json({ code: 'not_found', message: 'Opportunity not found' }, 404)
  }

  const [task] = await db
    .insert(schema.agentTasks)
    .values({
      userId,
      agentName: 'outreach',
      status: 'queued',
      sourceChannel: 'web',
      relatedType: 'opportunity',
      relatedId: opportunityId,
      input: {
        opportunityId,
        contactRole: body.contact_role,
        channel: body.channel,
        contactId: body.contact_id,
      },
    })
    .returning()

  await enqueueAgent('outreach', {
    taskId: task.id,
    userId,
    opportunityId,
    contactRole: body.contact_role,
    channel: body.channel,
    contactId: body.contact_id,
  })

  return c.json(task, 202)
})

// ── GET /outreach ─────────────────────────────────────────────
// List outreach drafts for the user, newest first.
app.get('/outreach', async (c) => {
  const userId = c.get('userId')
  const state = c.req.query('state')

  const conditions = [eq(schema.outreachMessages.userId, userId)]
  if (state) {
    const VALID_STATES = ['draft', 'approved', 'sent', 'replied', 'bounced', 'archived'] as const
    if (VALID_STATES.includes(state as (typeof VALID_STATES)[number])) {
      conditions.push(
        eq(
          schema.outreachMessages.state,
          state as (typeof VALID_STATES)[number],
        ),
      )
    }
  }

  const messages = await db
    .select()
    .from(schema.outreachMessages)
    .where(and(...conditions))
    .orderBy(desc(schema.outreachMessages.createdAt))
    .limit(100)

  return c.json(messages)
})

// ── GET /outreach/:id ─────────────────────────────────────────
app.get('/outreach/:id', async (c) => {
  const userId = c.get('userId')
  const messageId = c.req.param('id')

  const [message] = await db
    .select()
    .from(schema.outreachMessages)
    .where(
      and(eq(schema.outreachMessages.id, messageId), eq(schema.outreachMessages.userId, userId)),
    )
    .limit(1)

  if (!message) {
    return c.json({ code: 'not_found', message: 'Outreach message not found' }, 404)
  }

  return c.json(message)
})

// ── PATCH /outreach/:id/approve ───────────────────────────────
// Marks a draft as approved. Sending is a separate, explicit step (not implemented in v1).
app.patch('/outreach/:id/approve', async (c) => {
  const userId = c.get('userId')
  const messageId = c.req.param('id')

  const [message] = await db
    .select()
    .from(schema.outreachMessages)
    .where(
      and(eq(schema.outreachMessages.id, messageId), eq(schema.outreachMessages.userId, userId)),
    )
    .limit(1)

  if (!message) {
    return c.json({ code: 'not_found', message: 'Outreach message not found' }, 404)
  }

  if (message.state !== 'draft') {
    return c.json({ code: 'invalid_state', message: `Cannot approve a message in state '${message.state}'` }, 409)
  }

  const [updated] = await db
    .update(schema.outreachMessages)
    .set({ state: 'approved' })
    .where(eq(schema.outreachMessages.id, messageId))
    .returning()

  return c.json(updated)
})

// ── PATCH /outreach/:id/archive ───────────────────────────────
app.patch('/outreach/:id/archive', async (c) => {
  const userId = c.get('userId')
  const messageId = c.req.param('id')

  const [message] = await db
    .select()
    .from(schema.outreachMessages)
    .where(
      and(eq(schema.outreachMessages.id, messageId), eq(schema.outreachMessages.userId, userId)),
    )
    .limit(1)

  if (!message) {
    return c.json({ code: 'not_found', message: 'Outreach message not found' }, 404)
  }

  const [updated] = await db
    .update(schema.outreachMessages)
    .set({ state: 'archived' })
    .where(eq(schema.outreachMessages.id, messageId))
    .returning()

  return c.json(updated)
})

export { app as outreachRoutes }
