import { Hono } from 'hono'
import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { enqueueAgent } from '../workers/queue.js'

const app = new Hono()

// ── POST /opportunities/:id/resume ────────────────────────────
app.post('/opportunities/:id/resume', async (c) => {
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
      agentName: 'resume',
      status: 'queued',
      sourceChannel: 'web',
      relatedType: 'opportunity',
      relatedId: id,
      input: { opportunityId: id },
    })
    .returning()

  await enqueueAgent('resume', { taskId: task.id, userId, opportunityId: id })

  return c.json(task, 202)
})

// ── POST /opportunities/:id/cover-letter ──────────────────────
const CoverLetterBodySchema = z.object({
  tone: z.enum(['formal', 'warm', 'direct']).optional(),
})

app.post('/opportunities/:id/cover-letter', async (c) => {
  const userId = c.get('userId')
  const { id } = c.req.param()

  let body: z.infer<typeof CoverLetterBodySchema> = {}
  try {
    const raw = await c.req.json().catch(() => ({}))
    body = CoverLetterBodySchema.parse(raw)
  } catch (err) {
    return c.json({ code: 'validation_error', message: String(err) }, 400)
  }

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
      agentName: 'cover',
      status: 'queued',
      sourceChannel: 'web',
      relatedType: 'opportunity',
      relatedId: id,
      input: { opportunityId: id, tone: body.tone },
    })
    .returning()

  await enqueueAgent('cover', { taskId: task.id, userId, opportunityId: id, tone: body.tone })

  return c.json(task, 202)
})

// ── POST /opportunities/:id/vvp ───────────────────────────────
// Phase 2 stub — return 501
app.post('/opportunities/:id/vvp', async (c) => {
  return c.json({ code: 'not_implemented', message: 'VVP generation available in Phase 2' }, 501)
})

// ── GET /resumes/:id ──────────────────────────────────────────
app.get('/resumes/:id', async (c) => {
  const userId = c.get('userId')
  const { id } = c.req.param()

  const [resume] = await db
    .select({
      id: schema.resumeVersions.id,
      userId: schema.resumeVersions.userId,
      opportunityId: schema.resumeVersions.opportunityId,
      label: schema.resumeVersions.label,
      content: schema.resumeVersions.content,
      pdfPath: schema.resumeVersions.pdfPath,
      atsScore: schema.resumeVersions.atsScore,
      validated: schema.resumeVersions.validated,
      createdAt: schema.resumeVersions.createdAt,
    })
    .from(schema.resumeVersions)
    .where(and(eq(schema.resumeVersions.id, id), eq(schema.resumeVersions.userId, userId)))
    .limit(1)

  if (!resume) {
    return c.json({ code: 'not_found', message: 'Resume not found' }, 404)
  }

  return c.json({
    ...resume,
    // pdf_url would be a signed URL in Phase 2; for now return raw path
    pdf_url: resume.pdfPath ?? null,
  })
})

export { app as assetsRoutes }
