import { Hono } from 'hono'
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { pollSource } from '../workers/discoveryWorker.js'

const app = new Hono()

const VALID_BOARDS = ['remotive', 'remoteok', 'weworkremotely'] as const

const FiltersSchema = z.object({
  keywords: z.array(z.string()).optional(),
  category: z.string().optional(),
  minSalary: z.number().optional(),
  regions: z.array(z.string()).optional(),
})

const SourceBodySchema = z.object({
  board: z.enum(VALID_BOARDS),
  enabled: z.boolean().optional(),
  filters: FiltersSchema.optional(),
  poll_interval_minutes: z.number().int().min(60).max(1440).optional(),
})

// ── GET /job-boards/sources ───────────────────────────────────
app.get('/sources', async (c) => {
  const userId = c.get('userId')
  const rows = await db
    .select()
    .from(schema.jobBoardSources)
    .where(eq(schema.jobBoardSources.userId, userId))

  return c.json(
    rows.map((r) => ({
      id: r.id,
      board: r.board,
      enabled: r.enabled,
      filters: r.filters,
      poll_interval_minutes: r.pollIntervalMinutes,
      last_polled_at: r.lastPolledAt,
    })),
  )
})

// ── POST /job-boards/sources ──────────────────────────────────
app.post('/sources', async (c) => {
  const userId = c.get('userId')
  let body: z.infer<typeof SourceBodySchema>
  try {
    body = SourceBodySchema.parse(await c.req.json())
  } catch (err) {
    return c.json({ code: 'validation_error', message: String(err) }, 400)
  }

  // One source per board (upsert)
  const [existing] = await db
    .select({ id: schema.jobBoardSources.id })
    .from(schema.jobBoardSources)
    .where(
      and(
        eq(schema.jobBoardSources.userId, userId),
        eq(schema.jobBoardSources.board, body.board),
      ),
    )
    .limit(1)

  let row
  if (existing) {
    ;[row] = await db
      .update(schema.jobBoardSources)
      .set({
        enabled: body.enabled ?? true,
        filters: (body.filters ?? {}) as Record<string, unknown>,
        pollIntervalMinutes: body.poll_interval_minutes ?? 360,
      })
      .where(eq(schema.jobBoardSources.id, existing.id))
      .returning()
  } else {
    ;[row] = await db
      .insert(schema.jobBoardSources)
      .values({
        userId,
        board: body.board,
        enabled: body.enabled ?? true,
        filters: (body.filters ?? {}) as Record<string, unknown>,
        pollIntervalMinutes: body.poll_interval_minutes ?? 360,
      })
      .returning()
  }

  return c.json({
    id: row.id,
    board: row.board,
    enabled: row.enabled,
    filters: row.filters,
    poll_interval_minutes: row.pollIntervalMinutes,
    last_polled_at: row.lastPolledAt,
  }, existing ? 200 : 201)
})

// ── PATCH /job-boards/sources/:id ────────────────────────────
const PatchBodySchema = z.object({
  enabled: z.boolean().optional(),
  filters: FiltersSchema.optional(),
  poll_interval_minutes: z.number().int().min(60).max(1440).optional(),
})

app.patch('/sources/:id', async (c) => {
  const userId = c.get('userId')
  const { id } = c.req.param()

  const [source] = await db
    .select()
    .from(schema.jobBoardSources)
    .where(and(eq(schema.jobBoardSources.id, id), eq(schema.jobBoardSources.userId, userId)))
    .limit(1)

  if (!source) return c.json({ code: 'not_found', message: 'Source not found' }, 404)

  let body: z.infer<typeof PatchBodySchema>
  try {
    body = PatchBodySchema.parse(await c.req.json())
  } catch (err) {
    return c.json({ code: 'validation_error', message: String(err) }, 400)
  }

  const updates: Partial<typeof schema.jobBoardSources.$inferInsert> = {}
  if (body.enabled !== undefined) updates.enabled = body.enabled
  if (body.filters !== undefined) updates.filters = body.filters as Record<string, unknown>
  if (body.poll_interval_minutes !== undefined) updates.pollIntervalMinutes = body.poll_interval_minutes

  const [row] = await db
    .update(schema.jobBoardSources)
    .set(updates)
    .where(eq(schema.jobBoardSources.id, id))
    .returning()

  return c.json({
    id: row.id,
    board: row.board,
    enabled: row.enabled,
    filters: row.filters,
    poll_interval_minutes: row.pollIntervalMinutes,
    last_polled_at: row.lastPolledAt,
  })
})

// ── DELETE /job-boards/sources/:id ───────────────────────────
app.delete('/sources/:id', async (c) => {
  const userId = c.get('userId')
  const { id } = c.req.param()

  const [source] = await db
    .select({ id: schema.jobBoardSources.id })
    .from(schema.jobBoardSources)
    .where(and(eq(schema.jobBoardSources.id, id), eq(schema.jobBoardSources.userId, userId)))
    .limit(1)

  if (!source) return c.json({ code: 'not_found', message: 'Source not found' }, 404)

  await db.delete(schema.jobBoardSources).where(eq(schema.jobBoardSources.id, id))
  return c.body(null, 204)
})

// ── POST /job-boards/sources/:id/poll ────────────────────────
// Manual trigger — async, returns immediately with queued status
app.post('/sources/:id/poll', async (c) => {
  const userId = c.get('userId')
  const { id } = c.req.param()

  const [source] = await db
    .select()
    .from(schema.jobBoardSources)
    .where(and(eq(schema.jobBoardSources.id, id), eq(schema.jobBoardSources.userId, userId)))
    .limit(1)

  if (!source) return c.json({ code: 'not_found', message: 'Source not found' }, 404)

  // Fire-and-forget; result logged server-side
  pollSource(source).catch((err) => console.error('[job-boards/poll]', err))

  return c.json({ status: 'polling', board: source.board })
})

export { app as jobBoardsRoutes }
