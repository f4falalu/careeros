// Shared AgentTask lifecycle utilities.
// Called by every agent at the start (markRunning) and end (markSucceeded / markFailed).
// Also publishes a Redis pub/sub message so the WebSocket layer can push live updates.

import { db, schema } from '../../db/index.js'
import { eq } from 'drizzle-orm'
import Redis from 'ioredis'
import { config } from '../../config.js'

async function publishUpdate(task: unknown): Promise<void> {
  const pub = new Redis(config.redisUrl, { maxRetriesPerRequest: 1 })
  try {
    await pub.publish('ws:task-update', JSON.stringify(task))
  } finally {
    pub.disconnect()
  }
}

export async function markRunning(taskId: string): Promise<void> {
  const [t] = await db
    .update(schema.agentTasks)
    .set({ status: 'running', startedAt: new Date() })
    .where(eq(schema.agentTasks.id, taskId))
    .returning()
  if (t) await publishUpdate(t)
}

export async function markSucceeded(
  taskId: string,
  result: {
    output: unknown
    modelKind?: string
    modelName?: string
    costUsd?: number
    toolsUsed?: string[]
  },
): Promise<void> {
  const [t] = await db
    .update(schema.agentTasks)
    .set({
      status: 'succeeded',
      output: result.output as Record<string, unknown>,
      modelKind: (result.modelKind as 'local' | 'cloud') ?? null,
      modelName: result.modelName ?? null,
      costUsd: String(result.costUsd ?? 0),
      toolsUsed: result.toolsUsed ?? [],
      finishedAt: new Date(),
    })
    .where(eq(schema.agentTasks.id, taskId))
    .returning()
  if (t) await publishUpdate(t)
}

export async function markFailed(taskId: string, error: string): Promise<void> {
  const [t] = await db
    .update(schema.agentTasks)
    .set({ status: 'failed', error, finishedAt: new Date() })
    .where(eq(schema.agentTasks.id, taskId))
    .returning()
  if (t) await publishUpdate(t)
}
