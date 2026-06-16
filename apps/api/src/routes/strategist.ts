import { Hono } from 'hono'
import { and, desc, eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { enqueueAgent } from '../workers/queue.js'

const app = new Hono()

// ── POST /strategist/analyze ──────────────────────────────────
// Trigger a full pipeline analysis.
app.post('/analyze', async (c) => {
  const userId = c.get('userId')

  const [task] = await db
    .insert(schema.agentTasks)
    .values({
      userId,
      agentName: 'strategist',
      status: 'queued',
      sourceChannel: 'web',
      input: { userId },
    })
    .returning()

  await enqueueAgent('strategist', { taskId: task.id, userId })

  return c.json(task, 202)
})

// ── GET /strategist/latest ────────────────────────────────────
// Return the most recent succeeded strategist task (or null).
app.get('/latest', async (c) => {
  const userId = c.get('userId')

  const [task] = await db
    .select()
    .from(schema.agentTasks)
    .where(
      and(
        eq(schema.agentTasks.userId, userId),
        eq(schema.agentTasks.agentName, 'strategist'),
        eq(schema.agentTasks.status, 'succeeded'),
      ),
    )
    .orderBy(desc(schema.agentTasks.createdAt))
    .limit(1)

  return c.json(task ?? null)
})

export { app as strategistRoutes }
