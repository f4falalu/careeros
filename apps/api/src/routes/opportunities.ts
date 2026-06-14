import { Hono } from 'hono'
import { z } from 'zod'
import { and, eq, lt, desc, ilike, gte, inArray } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { enqueueAgent } from '../workers/queue.js'
import { serializeOpportunity, serializeCompany, serializeMatchScore, serializeApplication } from '../lib/serialize.js'

const app = new Hono()

// ── GET /opportunities ────────────────────────────────────────
app.get('/', async (c) => {
  const userId = c.get('userId')
  const stageParam = c.req.query('stage')
  const sourceParam = c.req.query('source')
  const limitParam = parseInt(c.req.query('limit') ?? '50', 10)
  const cursor = c.req.query('cursor') // ISO date string for cursor pagination

  // Discovery filters
  const workModelParam = c.req.query('work_model')
  const qParam = c.req.query('q')?.trim()
  const sinceParam = c.req.query('since') // e.g. '24h', '7d', '30d'
  const withCompany = c.req.query('with_company') === 'true'
  const withMatch = c.req.query('with_match') === 'true'

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
    if (workModelParam && ['remote', 'hybrid', 'onsite'].includes(workModelParam)) {
      conditions.push(eq(schema.opportunities.workModel, workModelParam as 'remote' | 'hybrid' | 'onsite'))
    }
    if (qParam) {
      conditions.push(ilike(schema.opportunities.roleTitle, `%${qParam}%`))
    }
    if (sinceParam) {
      const now = Date.now()
      const ms = sinceParam === '24h' ? 86_400_000
                : sinceParam === '7d'  ? 7 * 86_400_000
                : sinceParam === '30d' ? 30 * 86_400_000
                : null
      if (ms) conditions.push(gte(schema.opportunities.createdAt, new Date(now - ms)))
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

  // Optionally enrich with company names
  let companyMap = new Map<string, { name: string; industry?: string | null }>()
  if (withCompany) {
    const companyIds = [...new Set(items.map((r) => r.companyId).filter(Boolean) as string[])]
    if (companyIds.length > 0) {
      const companies = await db
        .select({ id: schema.companies.id, name: schema.companies.name, industry: schema.companies.industry })
        .from(schema.companies)
        .where(inArray(schema.companies.id, companyIds))
      companies.forEach((co) => companyMap.set(co.id, co))
    }
  }

  // Optionally enrich with latest match scores
  let matchMap = new Map<string, { score: number; missing_skills: string[]; rationale: string | null; computed_at: string }>()
  if (withMatch) {
    const oppIds = items.map((r) => r.id)
    if (oppIds.length > 0) {
      // Get latest score per opportunity using a self-join approach: fetch all and dedupe in memory
      const scores = await db
        .select()
        .from(schema.matchScores)
        .where(inArray(schema.matchScores.opportunityId, oppIds))
        .orderBy(desc(schema.matchScores.computedAt))
      // Keep only latest per opportunity
      scores.forEach((s) => {
        if (!matchMap.has(s.opportunityId)) {
          matchMap.set(s.opportunityId, {
            score: Number(s.score),
            missing_skills: s.missingSkills ?? [],
            rationale: s.rationale ?? null,
            computed_at: s.computedAt.toISOString(),
          })
        }
      })
    }
  }

  const enriched = items.map((r) =>
    serializeOpportunity({
      ...r,
      company_name: withCompany ? (companyMap.get(r.companyId ?? '')?.name ?? null) : undefined,
      company_industry: withCompany ? (companyMap.get(r.companyId ?? '')?.industry ?? null) : undefined,
      match_score: withMatch ? (matchMap.get(r.id) ?? null) : undefined,
    }),
  )

  // When match scores requested, sort by score desc (scored first, then unscored by date)
  if (withMatch) {
    enriched.sort((a, b) => {
      const sa = a.match_score?.score ?? -1
      const sb = b.match_score?.score ?? -1
      if (sb !== sa) return sb - sa
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
  }

  return c.json({ items: enriched, next_cursor: nextCursor })
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
    ...serializeOpportunity(opportunity),
    company: company ? serializeCompany(company) : null,
    match: match ? serializeMatchScore(match) : null,
    application: application ? serializeApplication(application) : null,
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
