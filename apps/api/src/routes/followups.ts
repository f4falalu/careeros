import { Hono } from 'hono'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { enqueueAgent } from '../workers/queue.js'

const app = new Hono()

// ── POST /outreach/:id/followups ──────────────────────────────
// Enqueue follow-up draft generation (day 3/7/14) for an outreach message.
app.post('/outreach/:id/followups', async (c) => {
  const userId = c.get('userId')
  const outreachId = c.req.param('id')

  const [outreach] = await db
    .select()
    .from(schema.outreachMessages)
    .where(
      and(eq(schema.outreachMessages.id, outreachId), eq(schema.outreachMessages.userId, userId)),
    )
    .limit(1)

  if (!outreach) {
    return c.json({ code: 'not_found', message: 'Outreach message not found' }, 404)
  }

  const [task] = await db
    .insert(schema.agentTasks)
    .values({
      userId,
      agentName: 'followup',
      status: 'queued',
      sourceChannel: 'web',
      relatedType: 'outreach',
      relatedId: outreachId,
      input: { outreachId },
    })
    .returning()

  await enqueueAgent('followup', { taskId: task.id, userId, outreachId })

  return c.json(task, 202)
})

// ── GET /outreach/:id/followups ───────────────────────────────
app.get('/outreach/:id/followups', async (c) => {
  const userId = c.get('userId')
  const outreachId = c.req.param('id')

  const [outreach] = await db
    .select()
    .from(schema.outreachMessages)
    .where(
      and(eq(schema.outreachMessages.id, outreachId), eq(schema.outreachMessages.userId, userId)),
    )
    .limit(1)

  if (!outreach) {
    return c.json({ code: 'not_found', message: 'Outreach message not found' }, 404)
  }

  const followUps = await db
    .select()
    .from(schema.followUps)
    .where(eq(schema.followUps.outreachId, outreachId))
    .orderBy(schema.followUps.dueAt)

  return c.json(followUps)
})

// ── PATCH /followups/:id/approve ──────────────────────────────
app.patch('/followups/:id/approve', async (c) => {
  const userId = c.get('userId')
  const followUpId = c.req.param('id')

  const [followUp] = await db
    .select()
    .from(schema.followUps)
    .where(eq(schema.followUps.id, followUpId))
    .limit(1)

  if (!followUp) {
    return c.json({ code: 'not_found', message: 'Follow-up not found' }, 404)
  }

  // Ownership check via outreach
  const [outreach] = await db
    .select()
    .from(schema.outreachMessages)
    .where(
      and(
        eq(schema.outreachMessages.id, followUp.outreachId),
        eq(schema.outreachMessages.userId, userId),
      ),
    )
    .limit(1)

  if (!outreach) {
    return c.json({ code: 'not_found', message: 'Follow-up not found' }, 404)
  }

  if (followUp.state !== 'draft') {
    return c.json(
      { code: 'invalid_state', message: `Cannot approve a follow-up in state '${followUp.state}'` },
      409,
    )
  }

  const [updated] = await db
    .update(schema.followUps)
    .set({ state: 'approved' })
    .where(eq(schema.followUps.id, followUpId))
    .returning()

  return c.json(updated)
})

export { app as followupsRoutes }
