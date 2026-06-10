import { Hono } from 'hono'
import { z } from 'zod'
import { and, desc, eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { enqueueAgent } from '../workers/queue.js'

const app = new Hono()

// ── POST /opportunities/:id/vvp/propose ───────────────────────
// Starts the VVP proposal step for an opportunity.
app.post('/opportunities/:id/vvp/propose', async (c) => {
  const userId = c.get('userId')
  const opportunityId = c.req.param('id')

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
      agentName: 'vvp_propose',
      status: 'queued',
      sourceChannel: 'web',
      relatedType: 'opportunity',
      relatedId: opportunityId,
      input: { opportunityId },
    })
    .returning()

  await enqueueAgent('vvp_propose', { taskId: task.id, userId, opportunityId })

  return c.json(task, 202)
})

// ── POST /vvps/:id/generate ───────────────────────────────────
// Generates a full VVP artifact from a selected angle (angleIndex 0/1/2).
const GenerateSchema = z.object({
  angle_index: z.number().int().min(0).max(2),
})

app.post('/vvps/:id/generate', async (c) => {
  const userId = c.get('userId')
  const vvpId = c.req.param('id')

  let body: z.infer<typeof GenerateSchema>
  try {
    body = GenerateSchema.parse(await c.req.json())
  } catch (err) {
    return c.json({ code: 'validation_error', message: String(err) }, 400)
  }

  const [vvp] = await db
    .select()
    .from(schema.vvps)
    .where(and(eq(schema.vvps.id, vvpId), eq(schema.vvps.userId, userId)))
    .limit(1)

  if (!vvp) {
    return c.json({ code: 'not_found', message: 'VVP not found' }, 404)
  }

  const [task] = await db
    .insert(schema.agentTasks)
    .values({
      userId,
      agentName: 'vvp_generate',
      status: 'queued',
      sourceChannel: 'web',
      relatedType: 'vvp',
      relatedId: vvpId,
      input: { vvpId, angleIndex: body.angle_index },
    })
    .returning()

  await enqueueAgent('vvp_generate', {
    taskId: task.id,
    userId,
    vvpId,
    angleIndex: body.angle_index,
  })

  return c.json(task, 202)
})

// ── GET /vvps ─────────────────────────────────────────────────
// List all VVPs for the user, newest first.
app.get('/vvps', async (c) => {
  const userId = c.get('userId')

  const vvps = await db
    .select()
    .from(schema.vvps)
    .where(eq(schema.vvps.userId, userId))
    .orderBy(desc(schema.vvps.createdAt))
    .limit(50)

  return c.json(vvps)
})

// ── GET /opportunities/:id/vvps ───────────────────────────────
// List VVPs for a specific opportunity.
app.get('/opportunities/:id/vvps', async (c) => {
  const userId = c.get('userId')
  const opportunityId = c.req.param('id')

  const vvps = await db
    .select()
    .from(schema.vvps)
    .where(and(eq(schema.vvps.userId, userId), eq(schema.vvps.opportunityId, opportunityId)))
    .orderBy(desc(schema.vvps.createdAt))

  return c.json(vvps)
})

// ── GET /vvps/:id ─────────────────────────────────────────────
app.get('/vvps/:id', async (c) => {
  const userId = c.get('userId')
  const vvpId = c.req.param('id')

  const [vvp] = await db
    .select()
    .from(schema.vvps)
    .where(and(eq(schema.vvps.id, vvpId), eq(schema.vvps.userId, userId)))
    .limit(1)

  if (!vvp) {
    return c.json({ code: 'not_found', message: 'VVP not found' }, 404)
  }

  return c.json(vvp)
})

export { app as vvpRoutes }
