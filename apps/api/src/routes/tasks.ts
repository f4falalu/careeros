import { Hono } from 'hono'
import { and, eq, desc } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { enqueueAgent } from '../workers/queue.js'
import { serializeAgentTask } from '../lib/serialize.js'

const app = new Hono()

const VALID_STATUSES = [
  'queued', 'running', 'succeeded', 'failed', 'needs_approval', 'cancelled',
] as const
type AgentStatus = (typeof VALID_STATUSES)[number]

// ── GET /tasks ────────────────────────────────────────────────
app.get('/', async (c) => {
  const userId = c.get('userId')
  const statusParam = c.req.query('status') as AgentStatus | undefined
  const limitParam = parseInt(c.req.query('limit') ?? '50', 10)
  const limit = Math.min(Math.max(1, limitParam), 200)

  if (statusParam && !VALID_STATUSES.includes(statusParam)) {
    return c.json({ code: 'validation_error', message: 'Invalid status value' }, 400)
  }

  const conditions = [eq(schema.agentTasks.userId, userId)]
  if (statusParam) {
    conditions.push(eq(schema.agentTasks.status, statusParam))
  }

  const rows = await db
    .select()
    .from(schema.agentTasks)
    .where(and(...conditions))
    .orderBy(desc(schema.agentTasks.createdAt))
    .limit(limit)

  return c.json(rows.map(serializeAgentTask))
})

// ── GET /tasks/:id ────────────────────────────────────────────
app.get('/:id', async (c) => {
  const userId = c.get('userId')
  const { id } = c.req.param()

  const [task] = await db
    .select()
    .from(schema.agentTasks)
    .where(and(eq(schema.agentTasks.id, id), eq(schema.agentTasks.userId, userId)))
    .limit(1)

  if (!task) {
    return c.json({ code: 'not_found', message: 'Task not found' }, 404)
  }

  return c.json(serializeAgentTask(task))
})

// ── POST /tasks/:id/approve ───────────────────────────────────
app.post('/:id/approve', async (c) => {
  const userId = c.get('userId')
  const { id } = c.req.param()

  const [task] = await db
    .select()
    .from(schema.agentTasks)
    .where(and(eq(schema.agentTasks.id, id), eq(schema.agentTasks.userId, userId)))
    .limit(1)

  if (!task) {
    return c.json({ code: 'not_found', message: 'Task not found' }, 404)
  }

  if (task.status !== 'needs_approval') {
    return c.json(
      { code: 'invalid_state', message: `Task is in status '${task.status}', not 'needs_approval'` },
      422,
    )
  }

  // Update task status back to queued so the worker can pick it up again
  const [updated] = await db
    .update(schema.agentTasks)
    .set({ status: 'queued' })
    .where(eq(schema.agentTasks.id, id))
    .returning()

  // Re-enqueue with the original input
  await enqueueAgent(task.agentName, {
    taskId: task.id,
    userId,
    ...((task.input as Record<string, unknown>) ?? {}),
    approved: true,
  })

  return c.json(serializeAgentTask(updated))
})

export { app as tasksRoutes }
