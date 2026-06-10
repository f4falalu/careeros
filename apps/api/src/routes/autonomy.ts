// Phase 4 autonomy triggers. Each enqueues a gated agent; the agent itself
// re-checks Settings → Autonomy before doing anything (defense in depth).
// Paths sit under already-authenticated prefixes (/opportunities, /contacts,
// /job-boards) so they inherit the bearer/session guard.

import { Hono } from 'hono'
import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { enqueueAgent } from '../workers/queue.js'

const app = new Hono()

async function createTask(
  userId: string,
  agentName: string,
  relatedType: string,
  relatedId: string | null,
  payload: Record<string, unknown>,
) {
  const [task] = await db
    .insert(schema.agentTasks)
    .values({
      userId,
      agentName,
      status: 'queued',
      sourceChannel: 'web',
      relatedType,
      relatedId,
      input: payload,
    })
    .returning()
  await enqueueAgent(agentName, { taskId: task.id, userId, ...payload })
  return task
}

// ── POST /opportunities/:id/apply ─────────────────────────────
app.post('/opportunities/:id/apply', async (c) => {
  const userId = c.get('userId')
  const opportunityId = c.req.param('id')

  const [opp] = await db
    .select({ id: schema.opportunities.id })
    .from(schema.opportunities)
    .where(and(eq(schema.opportunities.id, opportunityId), eq(schema.opportunities.userId, userId)))
    .limit(1)
  if (!opp) return c.json({ code: 'not_found', message: 'Opportunity not found' }, 404)

  const task = await createTask(userId, 'apply', 'opportunity', opportunityId, { opportunityId })
  return c.json(task, 202)
})

// ── POST /contacts/:id/enrich ─────────────────────────────────
app.post('/contacts/:id/enrich', async (c) => {
  const userId = c.get('userId')
  const contactId = c.req.param('id')

  const [contact] = await db
    .select({ id: schema.contacts.id })
    .from(schema.contacts)
    .where(and(eq(schema.contacts.id, contactId), eq(schema.contacts.userId, userId)))
    .limit(1)
  if (!contact) return c.json({ code: 'not_found', message: 'Contact not found' }, 404)

  const task = await createTask(userId, 'enrich', 'contact', contactId, { contactId })
  return c.json(task, 202)
})

// ── POST /job-boards/scrape ───────────────────────────────────
const ScrapeInput = z.object({ url: z.string().url() })

app.post('/job-boards/scrape', async (c) => {
  const userId = c.get('userId')
  let body: z.infer<typeof ScrapeInput>
  try {
    body = ScrapeInput.parse(await c.req.json())
  } catch (err) {
    return c.json({ code: 'validation_error', message: String(err) }, 400)
  }

  const task = await createTask(userId, 'scrape', 'scrape', null, { url: body.url })
  return c.json(task, 202)
})

export { app as autonomyRoutes }
