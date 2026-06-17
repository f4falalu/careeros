import { Hono } from 'hono'
import { z } from 'zod'
import { and, eq, desc, inArray, notExists, count, sql } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { serializeOpportunity } from '../lib/serialize.js'

const app = new Hono()

const WORK_MODELS = ['remote', 'hybrid', 'onsite', 'unknown'] as const

// Per-condition lock toggles — true means the condition is a strict gate.
const LocksSchema = z
  .object({
    location: z.boolean().optional(),
    work_model: z.boolean().optional(),
    seniority: z.boolean().optional(),
    min_salary: z.boolean().optional(),
  })
  .strict()

const CreateSchema = z.object({
  label: z.string().min(1).max(120),
  role_titles: z.array(z.string()).optional(),
  keywords: z.array(z.string()).optional(),
  seniority: z.array(z.string()).optional(),
  locations: z.array(z.string()).optional(),
  work_models: z.array(z.enum(WORK_MODELS)).optional(),
  min_salary: z.number().int().positive().nullable().optional(),
  locks: LocksSchema.optional(),
  status: z.enum(['active', 'paused']).optional(),
})

const PatchSchema = z.object({
  label: z.string().min(1).max(120).optional(),
  role_titles: z.array(z.string()).optional(),
  keywords: z.array(z.string()).optional(),
  seniority: z.array(z.string()).optional(),
  locations: z.array(z.string()).optional(),
  work_models: z.array(z.enum(WORK_MODELS)).optional(),
  min_salary: z.number().int().positive().nullable().optional(),
  locks: LocksSchema.optional(),
  status: z.enum(['active', 'paused']).optional(),
})

function serializeTarget(t: schema.JobTarget) {
  return {
    id: t.id,
    label: t.label,
    role_titles: t.roleTitles ?? [],
    keywords: t.keywords ?? [],
    seniority: t.seniority ?? [],
    locations: t.locations ?? [],
    work_models: t.workModels ?? [],
    min_salary: t.minSalary,
    locks: t.locks ?? {},
    status: t.status,
    created_at: t.createdAt,
    updated_at: t.updatedAt,
  }
}

function serializeLinkedOpp(opp: schema.Opportunity, link: schema.OpportunityTarget) {
  return {
    ...serializeOpportunity(opp),
    fit_tier: link.fitTier,
    capability_score: link.capabilityScore != null ? Number(link.capabilityScore) : null,
    // Flag capability-based fits so the UI can label "your skills qualify you".
    is_adjacent: link.fitTier === 'adjacent',
  }
}

// ── GET /job-targets ──────────────────────────────────────────
app.get('/', async (c) => {
  const userId = c.get('userId')
  const targets = await db
    .select()
    .from(schema.jobTargets)
    .where(eq(schema.jobTargets.userId, userId))
    .orderBy(desc(schema.jobTargets.createdAt))

  const ids = targets.map((t) => t.id)
  const countMap = new Map<string, number>()
  if (ids.length > 0) {
    const rows = await db
      .select({ targetId: schema.opportunityTargets.targetId, n: count() })
      .from(schema.opportunityTargets)
      .where(inArray(schema.opportunityTargets.targetId, ids))
      .groupBy(schema.opportunityTargets.targetId)
    rows.forEach((r) => countMap.set(r.targetId, Number(r.n)))
  }

  return c.json(
    targets.map((t) => ({ ...serializeTarget(t), opportunity_count: countMap.get(t.id) ?? 0 })),
  )
})

// ── GET /job-targets/recommendations ──────────────────────────
// Grouped view: every Target with its opportunities bucketed by tier, plus the
// Untargeted bucket. Registered before /:id so "recommendations" isn't read as an id.
app.get('/recommendations', async (c) => {
  const userId = c.get('userId')

  const targets = await db
    .select()
    .from(schema.jobTargets)
    .where(eq(schema.jobTargets.userId, userId))
    .orderBy(desc(schema.jobTargets.createdAt))

  const targetIds = targets.map((t) => t.id)

  const byTarget = new Map<
    string,
    { on_target: ReturnType<typeof serializeLinkedOpp>[]; adjacent: ReturnType<typeof serializeLinkedOpp>[]; unconfirmed: ReturnType<typeof serializeLinkedOpp>[] }
  >()
  targets.forEach((t) => byTarget.set(t.id, { on_target: [], adjacent: [], unconfirmed: [] }))

  const matchedOppIds = new Set<string>()
  if (targetIds.length > 0) {
    const links = await db
      .select({ ot: schema.opportunityTargets, opp: schema.opportunities })
      .from(schema.opportunityTargets)
      .innerJoin(
        schema.opportunities,
        eq(schema.opportunities.id, schema.opportunityTargets.opportunityId),
      )
      .where(inArray(schema.opportunityTargets.targetId, targetIds))
      .orderBy(desc(schema.opportunities.createdAt))

    for (const row of links) {
      matchedOppIds.add(row.ot.opportunityId)
      const bucket = byTarget.get(row.ot.targetId)
      if (bucket) bucket[row.ot.fitTier].push(serializeLinkedOpp(row.opp, row.ot))
    }
  }

  // Untargeted: this user's opportunities with no Target link at all.
  const noLink = notExists(
    db
      .select({ one: sql`1` })
      .from(schema.opportunityTargets)
      .where(eq(schema.opportunityTargets.opportunityId, schema.opportunities.id)),
  )

  const untargetedRows = await db
    .select()
    .from(schema.opportunities)
    .where(and(eq(schema.opportunities.userId, userId), noLink))
    .orderBy(desc(schema.opportunities.createdAt))
    .limit(50)

  const [untargetedTotal] = await db
    .select({ n: count() })
    .from(schema.opportunities)
    .where(and(eq(schema.opportunities.userId, userId), noLink))

  return c.json({
    targets: targets.map((t) => {
      const b = byTarget.get(t.id)!
      return {
        ...serializeTarget(t),
        // Ordered on_target → adjacent → unconfirmed.
        tiers: { on_target: b.on_target, adjacent: b.adjacent, unconfirmed: b.unconfirmed },
        count: b.on_target.length + b.adjacent.length + b.unconfirmed.length,
      }
    }),
    untargeted: untargetedRows.map((o) => serializeOpportunity(o)),
    totals: { matched: matchedOppIds.size, untargeted: Number(untargetedTotal?.n ?? 0) },
  })
})

// ── GET /job-targets/:id ──────────────────────────────────────
app.get('/:id', async (c) => {
  const userId = c.get('userId')
  const { id } = c.req.param()

  const [target] = await db
    .select()
    .from(schema.jobTargets)
    .where(and(eq(schema.jobTargets.id, id), eq(schema.jobTargets.userId, userId)))
    .limit(1)

  if (!target) return c.json({ code: 'not_found', message: 'Job target not found' }, 404)

  const links = await db
    .select({ ot: schema.opportunityTargets, opp: schema.opportunities })
    .from(schema.opportunityTargets)
    .innerJoin(
      schema.opportunities,
      eq(schema.opportunities.id, schema.opportunityTargets.opportunityId),
    )
    .where(eq(schema.opportunityTargets.targetId, id))
    .orderBy(desc(schema.opportunities.createdAt))

  const tiers = { on_target: [] as ReturnType<typeof serializeLinkedOpp>[], adjacent: [] as ReturnType<typeof serializeLinkedOpp>[], unconfirmed: [] as ReturnType<typeof serializeLinkedOpp>[] }
  for (const row of links) tiers[row.ot.fitTier].push(serializeLinkedOpp(row.opp, row.ot))

  return c.json({ ...serializeTarget(target), tiers, count: links.length })
})

// ── POST /job-targets ─────────────────────────────────────────
app.post('/', async (c) => {
  const userId = c.get('userId')
  let body: z.infer<typeof CreateSchema>
  try {
    body = CreateSchema.parse(await c.req.json())
  } catch (err) {
    return c.json({ code: 'validation_error', message: String(err) }, 400)
  }

  // A Target must express at least one intent signal or one condition.
  const hasIntent = (body.role_titles?.length ?? 0) > 0 || (body.keywords?.length ?? 0) > 0
  const hasCondition =
    (body.seniority?.length ?? 0) > 0 ||
    (body.locations?.length ?? 0) > 0 ||
    (body.work_models?.length ?? 0) > 0 ||
    body.min_salary != null
  if (!hasIntent && !hasCondition) {
    return c.json(
      { code: 'validation_error', message: 'A target needs at least one role title, keyword, or condition' },
      400,
    )
  }

  // New Targets default location + work_model locked; explicit locks override.
  const locks = { location: true, work_model: true, ...(body.locks ?? {}) }

  const [row] = await db
    .insert(schema.jobTargets)
    .values({
      userId,
      label: body.label,
      roleTitles: body.role_titles ?? [],
      keywords: body.keywords ?? [],
      seniority: body.seniority ?? [],
      locations: body.locations ?? [],
      workModels: body.work_models ?? [],
      minSalary: body.min_salary ?? null,
      locks,
      status: body.status ?? 'active',
    })
    .returning()

  return c.json(serializeTarget(row), 201)
})

// ── PATCH /job-targets/:id ────────────────────────────────────
app.patch('/:id', async (c) => {
  const userId = c.get('userId')
  const { id } = c.req.param()

  const [target] = await db
    .select()
    .from(schema.jobTargets)
    .where(and(eq(schema.jobTargets.id, id), eq(schema.jobTargets.userId, userId)))
    .limit(1)

  if (!target) return c.json({ code: 'not_found', message: 'Job target not found' }, 404)

  let body: z.infer<typeof PatchSchema>
  try {
    body = PatchSchema.parse(await c.req.json())
  } catch (err) {
    return c.json({ code: 'validation_error', message: String(err) }, 400)
  }

  const updates: Partial<typeof schema.jobTargets.$inferInsert> = { updatedAt: new Date() }
  if (body.label !== undefined) updates.label = body.label
  if (body.role_titles !== undefined) updates.roleTitles = body.role_titles
  if (body.keywords !== undefined) updates.keywords = body.keywords
  if (body.seniority !== undefined) updates.seniority = body.seniority
  if (body.locations !== undefined) updates.locations = body.locations
  if (body.work_models !== undefined) updates.workModels = body.work_models
  if (body.min_salary !== undefined) updates.minSalary = body.min_salary
  if (body.status !== undefined) updates.status = body.status
  // Lock toggles merge into existing locks so callers can flip one condition.
  if (body.locks !== undefined) {
    updates.locks = { ...(target.locks as Record<string, unknown>), ...body.locks }
  }

  const [row] = await db
    .update(schema.jobTargets)
    .set(updates)
    .where(eq(schema.jobTargets.id, id))
    .returning()

  return c.json(serializeTarget(row))
})

// ── DELETE /job-targets/:id ───────────────────────────────────
app.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const { id } = c.req.param()

  const [target] = await db
    .select({ id: schema.jobTargets.id })
    .from(schema.jobTargets)
    .where(and(eq(schema.jobTargets.id, id), eq(schema.jobTargets.userId, userId)))
    .limit(1)

  if (!target) return c.json({ code: 'not_found', message: 'Job target not found' }, 404)

  // FK cascade removes opportunity_targets links; opportunities left with no link
  // simply become Untargeted (never deleted).
  await db.delete(schema.jobTargets).where(eq(schema.jobTargets.id, id))
  return c.body(null, 204)
})

export { app as jobTargetsRoutes }
