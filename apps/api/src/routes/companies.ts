import { Hono } from 'hono'
import { and, eq, desc, sql } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { enqueueAgent } from '../workers/queue.js'

const app = new Hono()

// ── GET /companies ────────────────────────────────────────────
app.get('/', async (c) => {
  const userId = c.get('userId')

  const rows = await db
    .select({
      id: schema.companies.id,
      name: schema.companies.name,
      domain: schema.companies.domain,
      industry: schema.companies.industry,
      hqLocation: schema.companies.hqLocation,
      sizeBand: schema.companies.sizeBand,
      createdAt: schema.companies.createdAt,
      opportunityCount: sql<number>`count(distinct ${schema.opportunities.id})`,
      briefCount: sql<number>`count(distinct ${schema.companyBriefs.id})`,
    })
    .from(schema.companies)
    .leftJoin(schema.opportunities, eq(schema.opportunities.companyId, schema.companies.id))
    .leftJoin(schema.companyBriefs, eq(schema.companyBriefs.companyId, schema.companies.id))
    .where(eq(schema.companies.userId, userId))
    .groupBy(schema.companies.id)
    .orderBy(desc(schema.companies.createdAt))

  return c.json(
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      domain: r.domain,
      industry: r.industry,
      hq_location: r.hqLocation,
      size_band: r.sizeBand,
      created_at: r.createdAt,
      opportunity_count: Number(r.opportunityCount),
      has_brief: Number(r.briefCount) > 0,
    })),
  )
})

// ── GET /companies/:id ────────────────────────────────────────
app.get('/:id', async (c) => {
  const userId = c.get('userId')
  const { id } = c.req.param()

  const [company] = await db
    .select()
    .from(schema.companies)
    .where(and(eq(schema.companies.id, id), eq(schema.companies.userId, userId)))
    .limit(1)

  if (!company) {
    return c.json({ code: 'not_found', message: 'Company not found' }, 404)
  }

  // Fetch latest brief (exclude the generated column for compatibility)
  const [brief] = await db
    .select({
      id: schema.companyBriefs.id,
      companyId: schema.companyBriefs.companyId,
      content: schema.companyBriefs.content,
      sources: schema.companyBriefs.sources,
      fetchedAt: schema.companyBriefs.fetchedAt,
      isStale: schema.companyBriefs.isStale,
    })
    .from(schema.companyBriefs)
    .where(eq(schema.companyBriefs.companyId, id))
    .orderBy(desc(schema.companyBriefs.fetchedAt))
    .limit(1)

  return c.json({
    ...company,
    latest_brief: brief ?? null,
  })
})

// ── POST /companies/:id/brief ─────────────────────────────────
app.post('/:id/brief', async (c) => {
  const userId = c.get('userId')
  const { id } = c.req.param()

  const [company] = await db
    .select()
    .from(schema.companies)
    .where(and(eq(schema.companies.id, id), eq(schema.companies.userId, userId)))
    .limit(1)

  if (!company) {
    return c.json({ code: 'not_found', message: 'Company not found' }, 404)
  }

  const [task] = await db
    .insert(schema.agentTasks)
    .values({
      userId,
      agentName: 'research',
      status: 'queued',
      sourceChannel: 'web',
      relatedType: 'company',
      relatedId: id,
      input: { companyId: id },
    })
    .returning()

  await enqueueAgent('research', { taskId: task.id, userId, companyId: id })

  return c.json(task, 202)
})

export { app as companiesRoutes }
