import { Hono } from 'hono'
import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { enqueueAgent } from '../workers/queue.js'
import { serializeApplication } from '../lib/serialize.js'

const app = new Hono()

const VALID_STAGES = [
  'saved', 'applied', 'assessment', 'interview', 'final', 'offer', 'rejected', 'withdrawn',
] as const
type PipelineStage = (typeof VALID_STAGES)[number]

// ── GET /applications ─────────────────────────────────────────
app.get('/', async (c) => {
  const userId = c.get('userId')
  const stageParam = c.req.query('stage') as PipelineStage | undefined

  if (stageParam && !VALID_STAGES.includes(stageParam)) {
    return c.json({ code: 'validation_error', message: 'Invalid stage value' }, 400)
  }

  const conditions = [eq(schema.applications.userId, userId)]
  if (stageParam) {
    conditions.push(eq(schema.applications.stage, stageParam))
  }

  const rows = await db
    .select()
    .from(schema.applications)
    .where(and(...conditions))

  return c.json(rows.map(serializeApplication))
})

// ── POST /applications ────────────────────────────────────────
const CreateApplicationSchema = z.object({
  opportunity_id: z.string().uuid(),
  notes: z.string().optional(),
})

app.post('/', async (c) => {
  const userId = c.get('userId')
  let body: z.infer<typeof CreateApplicationSchema>
  try {
    body = CreateApplicationSchema.parse(await c.req.json())
  } catch (err) {
    return c.json({ code: 'validation_error', message: String(err) }, 400)
  }

  // Verify opportunity belongs to user
  const [opportunity] = await db
    .select()
    .from(schema.opportunities)
    .where(
      and(
        eq(schema.opportunities.id, body.opportunity_id),
        eq(schema.opportunities.userId, userId),
      ),
    )
    .limit(1)

  if (!opportunity) {
    return c.json({ code: 'not_found', message: 'Opportunity not found' }, 404)
  }

  // Check if application already exists
  const [existing] = await db
    .select()
    .from(schema.applications)
    .where(eq(schema.applications.opportunityId, body.opportunity_id))
    .limit(1)

  if (existing) {
    return c.json({ code: 'conflict', message: 'Application already exists for this opportunity' }, 409)
  }

  const [application] = await db
    .insert(schema.applications)
    .values({
      userId,
      opportunityId: body.opportunity_id,
      stage: 'saved',
      notes: body.notes,
    })
    .returning()

  // Record initial stage event
  await db.insert(schema.stageEvents).values({
    applicationId: application.id,
    fromStage: null,
    toStage: 'saved',
    actor: 'user',
    note: 'Application created',
  })

  return c.json(serializeApplication(application), 201)
})

// ── PATCH /applications/:id/stage ─────────────────────────────
const StageUpdateSchema = z.object({
  to_stage: z.enum(VALID_STAGES),
  note: z.string().optional(),
})

app.patch('/:id/stage', async (c) => {
  const userId = c.get('userId')
  const { id } = c.req.param()
  let body: z.infer<typeof StageUpdateSchema>
  try {
    body = StageUpdateSchema.parse(await c.req.json())
  } catch (err) {
    return c.json({ code: 'validation_error', message: String(err) }, 400)
  }

  const [application] = await db
    .select()
    .from(schema.applications)
    .where(and(eq(schema.applications.id, id), eq(schema.applications.userId, userId)))
    .limit(1)

  if (!application) {
    return c.json({ code: 'not_found', message: 'Application not found' }, 404)
  }

  const updateData: Partial<typeof schema.applications.$inferInsert> = {
    stage: body.to_stage,
  }

  // Set applied_at if moving to applied stage
  if (body.to_stage === 'applied' && !application.appliedAt) {
    updateData.appliedAt = new Date()
  }

  const [updated] = await db
    .update(schema.applications)
    .set(updateData)
    .where(eq(schema.applications.id, id))
    .returning()

  // Record stage event
  await db.insert(schema.stageEvents).values({
    applicationId: id,
    fromStage: application.stage,
    toStage: body.to_stage,
    actor: 'user',
    note: body.note,
  })

  return c.json(serializeApplication(updated))
})

// ── POST /applications/:id/interview-brief ────────────────────
// Phase 3 stub — return 501
app.post('/:id/interview-brief', async (c) => {
  return c.json({ code: 'not_implemented', message: 'Interview brief available in Phase 3' }, 501)
})

export { app as applicationsRoutes }
