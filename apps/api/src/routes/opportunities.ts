import { Hono } from 'hono'
import { z } from 'zod'
import { and, eq, lt, desc } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { enqueueAgent } from '../workers/queue.js'

const app = new Hono()

// ── GET /opportunities ────────────────────────────────────────
app.get('/', async (c) => {
  const userId = c.get('userId')
  const stageParam = c.req.query('stage')
  const sourceParam = c.req.query('source')
  const limitParam = parseInt(c.req.query('limit') ?? '50', 10)
  const cursor = c.req.query('cursor') // ISO date string for cursor pagination

  const limit = Math.min(Math.max(1, limitParam), 200)

  // Build the base query
  let rows: typeof schema.opportunities.$inferSelect[]

  if (stageParam) {
    // Filter by stage: join applications table
    const validStages = [
      'saved', 'applied', 'assessment', 'interview', 'final', 'offer', 'rejected', 'withdrawn',
    ] as const
    if (!validStages.includes(stageParam as (typeof validStages)[number])) {
      return c.json({ code: 'validation_error', message: 'Invalid stage value' }, 400)
    }

    const appsWithStage = await db
      .select({ opportunityId: schema.applications.opportunityId })
      .from(schema.applications)
      .where(
        and(
          eq(schema.applications.userId, userId),
          eq(schema.applications.stage, stageParam as (typeof validStages)[number]),
        ),
      )

    const oppIds = appsWithStage.map((a) => a.opportunityId)
    if (oppIds.length === 0) {
      return c.json({ items: [], next_cursor: null })
    }

    rows = await db
      .select()
      .from(schema.opportunities)
      .where(eq(schema.opportunities.userId, userId))
      .orderBy(desc(schema.opportunities.createdAt))
      .limit(limit + 1)
  } else {
    const conditions = [eq(schema.opportunities.userId, userId)]
    if (cursor) {
      conditions.push(lt(schema.opportunities.createdAt, new Date(cursor)))
    }
    if (sourceParam) {
      conditions.push(eq(schema.opportunities.sourceChannel, sourceParam as 'job_board'))
    }
    rows = await db
      .select()
      .from(schema.opportunities)
      .where(and(...conditions))
      .orderBy(desc(schema.opportunities.createdAt))
      .limit(limit + 1)
  }

  const hasMore = rows.length > limit
  const items = hasMore ? rows.slice(0, limit) : rows
  const nextCursor = hasMore ? items[items.length - 1].createdAt.toISOString() : null

  return c.json({ items, next_cursor: nextCursor })
})

// ── GET /opportunities/:id ────────────────────────────────────
app.get('/:id', async (c) => {
  const userId = c.get('userId')
  const { id } = c.req.param()

  const [opportunity] = await db
    .select()
    .from(schema.opportunities)
    .where(and(eq(schema.opportunities.id, id), eq(schema.opportunities.userId, userId)))
    .limit(1)

  if (!opportunity) {
    return c.json({ code: 'not_found', message: 'Opportunity not found' }, 404)
  }

  // Fetch company
  const company = opportunity.companyId
    ? (
        await db
          .select()
          .from(schema.companies)
          .where(eq(schema.companies.id, opportunity.companyId!))
          .limit(1)
      )[0] ?? null
    : null

  // Fetch latest match score
  const [match] = await db
    .select()
    .from(schema.matchScores)
    .where(eq(schema.matchScores.opportunityId, id))
    .orderBy(desc(schema.matchScores.computedAt))
    .limit(1)

  // Fetch application
  const [application] = await db
    .select()
    .from(schema.applications)
    .where(eq(schema.applications.opportunityId, id))
    .limit(1)

  return c.json({
    ...opportunity,
    company: company ?? null,
    match: match ?? null,
    application: application ?? null,
  })
})

// ── GET /opportunities/:id/resume-versions ────────────────────
app.get('/:id/resume-versions', async (c) => {
  const userId = c.get('userId')
  const { id } = c.req.param()

  const [opportunity] = await db
    .select({ id: schema.opportunities.id })
    .from(schema.opportunities)
    .where(and(eq(schema.opportunities.id, id), eq(schema.opportunities.userId, userId)))
    .limit(1)

  if (!opportunity) {
    return c.json({ code: 'not_found', message: 'Opportunity not found' }, 404)
  }

  const versions = await db
    .select()
    .from(schema.resumeVersions)
    .where(
      and(
        eq(schema.resumeVersions.opportunityId, id),
        eq(schema.resumeVersions.userId, userId),
      ),
    )
    .orderBy(desc(schema.resumeVersions.createdAt))

  return c.json(versions)
})

// ── GET /opportunities/:id/cover-letters ─────────────────────
app.get('/:id/cover-letters', async (c) => {
  const userId = c.get('userId')
  const { id } = c.req.param()

  const [opportunity] = await db
    .select({ id: schema.opportunities.id })
    .from(schema.opportunities)
    .where(and(eq(schema.opportunities.id, id), eq(schema.opportunities.userId, userId)))
    .limit(1)

  if (!opportunity) {
    return c.json({ code: 'not_found', message: 'Opportunity not found' }, 404)
  }

  const letters = await db
    .select()
    .from(schema.coverLetters)
    .where(
      and(
        eq(schema.coverLetters.opportunityId, id),
        eq(schema.coverLetters.userId, userId),
      ),
    )
    .orderBy(desc(schema.coverLetters.createdAt))

  return c.json(letters)
})

// ── POST /opportunities/:id/match ─────────────────────────────
app.post('/:id/match', async (c) => {
  const userId = c.get('userId')
  const { id } = c.req.param()

  const [opportunity] = await db
    .select()
    .from(schema.opportunities)
    .where(and(eq(schema.opportunities.id, id), eq(schema.opportunities.userId, userId)))
    .limit(1)

  if (!opportunity) {
    return c.json({ code: 'not_found', message: 'Opportunity not found' }, 404)
  }

  const [task] = await db
    .insert(schema.agentTasks)
    .values({
      userId,
      agentName: 'match',
      status: 'queued',
      sourceChannel: 'web',
      relatedType: 'opportunity',
      relatedId: id,
      input: { opportunityId: id },
    })
    .returning()

  await enqueueAgent('match', { taskId: task.id, userId, opportunityId: id })

  return c.json(task, 202)
})

// ── GET /opportunities/:id/outreach ──────────────────────────
app.get('/:id/outreach', async (c) => {
  const userId = c.get('userId')
  const { id } = c.req.param()

  const [opportunity] = await db
    .select({ id: schema.opportunities.id })
    .from(schema.opportunities)
    .where(and(eq(schema.opportunities.id, id), eq(schema.opportunities.userId, userId)))
    .limit(1)

  if (!opportunity) {
    return c.json({ code: 'not_found', message: 'Opportunity not found' }, 404)
  }

  const messages = await db
    .select()
    .from(schema.outreachMessages)
    .where(
      and(
        eq(schema.outreachMessages.opportunityId, id),
        eq(schema.outreachMessages.userId, userId),
      ),
    )
    .orderBy(desc(schema.outreachMessages.createdAt))

  return c.json(messages)
})

export { app as opportunitiesRoutes }
