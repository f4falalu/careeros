import { Hono } from 'hono'
import { z } from 'zod'
import { and, desc, eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { enqueueAgent } from '../workers/queue.js'

const app = new Hono()

// ── POST /applications/:id/interview-brief ────────────────────
// Trigger interview brief generation for an application.
app.post('/applications/:id/interview-brief', async (c) => {
  const userId = c.get('userId')
  const applicationId = c.req.param('id')

  const [application] = await db
    .select()
    .from(schema.applications)
    .where(and(eq(schema.applications.id, applicationId), eq(schema.applications.userId, userId)))
    .limit(1)

  if (!application) {
    return c.json({ code: 'not_found', message: 'Application not found' }, 404)
  }

  const [task] = await db
    .insert(schema.agentTasks)
    .values({
      userId,
      agentName: 'interview_brief',
      status: 'queued',
      sourceChannel: 'web',
      relatedType: 'application',
      relatedId: applicationId,
      input: { applicationId },
    })
    .returning()

  await enqueueAgent('interview_brief', { taskId: task.id, userId, applicationId })

  return c.json(task, 202)
})

// ── GET /interviews ───────────────────────────────────────────
app.get('/interviews', async (c) => {
  const userId = c.get('userId')

  const interviews = await db
    .select()
    .from(schema.interviews)
    .where(eq(schema.interviews.userId, userId))
    .orderBy(desc(schema.interviews.createdAt))

  return c.json(interviews)
})

// ── GET /interviews/:id ───────────────────────────────────────
app.get('/interviews/:id', async (c) => {
  const userId = c.get('userId')
  const interviewId = c.req.param('id')

  const [interview] = await db
    .select()
    .from(schema.interviews)
    .where(and(eq(schema.interviews.id, interviewId), eq(schema.interviews.userId, userId)))
    .limit(1)

  if (!interview) {
    return c.json({ code: 'not_found', message: 'Interview not found' }, 404)
  }

  return c.json(interview)
})

// ── GET /applications/:id/interview ──────────────────────────
// Convenience: look up interview by application ID.
app.get('/applications/:id/interview', async (c) => {
  const userId = c.get('userId')
  const applicationId = c.req.param('id')

  const [application] = await db
    .select()
    .from(schema.applications)
    .where(and(eq(schema.applications.id, applicationId), eq(schema.applications.userId, userId)))
    .limit(1)

  if (!application) {
    return c.json({ code: 'not_found', message: 'Application not found' }, 404)
  }

  const [interview] = await db
    .select()
    .from(schema.interviews)
    .where(eq(schema.interviews.applicationId, applicationId))
    .limit(1)

  return c.json(interview ?? null)
})

// ── POST /interviews/:id/mock ─────────────────────────────────
// Run one mock Q&A turn.
const MockQuestionSchema = z.object({
  question: z.string().min(5).max(500),
  session_id: z.string().uuid().optional(),
})

app.post('/interviews/:id/mock', async (c) => {
  const userId = c.get('userId')
  const interviewId = c.req.param('id')

  let body: z.infer<typeof MockQuestionSchema>
  try {
    body = MockQuestionSchema.parse(await c.req.json())
  } catch (err) {
    return c.json({ code: 'validation_error', message: String(err) }, 400)
  }

  const [interview] = await db
    .select()
    .from(schema.interviews)
    .where(and(eq(schema.interviews.id, interviewId), eq(schema.interviews.userId, userId)))
    .limit(1)

  if (!interview) {
    return c.json({ code: 'not_found', message: 'Interview not found' }, 404)
  }

  const [task] = await db
    .insert(schema.agentTasks)
    .values({
      userId,
      agentName: 'mock_session',
      status: 'queued',
      sourceChannel: 'web',
      relatedType: 'interview',
      relatedId: interviewId,
      input: { interviewId, question: body.question, sessionId: body.session_id },
    })
    .returning()

  await enqueueAgent('mock_session', {
    taskId: task.id,
    userId,
    interviewId,
    question: body.question,
    sessionId: body.session_id,
  })

  return c.json(task, 202)
})

// ── GET /interviews/:id/mock-sessions ────────────────────────
app.get('/interviews/:id/mock-sessions', async (c) => {
  const userId = c.get('userId')
  const interviewId = c.req.param('id')

  const [interview] = await db
    .select()
    .from(schema.interviews)
    .where(and(eq(schema.interviews.id, interviewId), eq(schema.interviews.userId, userId)))
    .limit(1)

  if (!interview) {
    return c.json({ code: 'not_found', message: 'Interview not found' }, 404)
  }

  const sessions = await db
    .select()
    .from(schema.mockSessions)
    .where(eq(schema.mockSessions.interviewId, interviewId))
    .orderBy(desc(schema.mockSessions.createdAt))

  return c.json(sessions)
})

export { app as interviewsRoutes }
