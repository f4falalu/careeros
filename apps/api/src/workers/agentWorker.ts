import { Worker } from 'bullmq'
import { QUEUE_NAME } from './queue.js'
import { config } from '../config.js'
import { db, schema } from '../db/index.js'
import { eq } from 'drizzle-orm'
import Redis from 'ioredis'

// ── Redis pub/sub helper ──────────────────────────────────────────────────────

/**
 * Publishes a task-update event on the `ws:task-update` channel so the WebSocket
 * layer can forward live progress to the dashboard.
 */
async function publishTaskUpdate(task: Record<string, unknown>): Promise<void> {
  const pub = new Redis(config.redisUrl, { maxRetriesPerRequest: null })
  try {
    await pub.publish('ws:task-update', JSON.stringify(task))
  } finally {
    pub.disconnect()
  }
}

// ── AgentTask updater ─────────────────────────────────────────────────────────

type TaskStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'needs_approval' | 'cancelled'

async function updateTask(
  taskId: string,
  update: Partial<{
    status: TaskStatus
    output: unknown
    error: string
    modelKind: 'local' | 'cloud'
    modelName: string
    costUsd: number
    toolsUsed: string[]
    startedAt: Date
    finishedAt: Date
  }>,
): Promise<void> {
  const rows = await db
    .update(schema.agentTasks)
    .set({
      ...(update.status !== undefined && { status: update.status }),
      ...(update.output !== undefined && { output: update.output as Record<string, unknown> }),
      ...(update.error !== undefined && { error: update.error }),
      ...(update.modelKind !== undefined && { modelKind: update.modelKind }),
      ...(update.modelName !== undefined && { modelName: update.modelName }),
      // Drizzle stores numeric(12,6) as a string in the schema; coerce here.
      ...(update.costUsd !== undefined && { costUsd: String(update.costUsd) }),
      ...(update.toolsUsed !== undefined && { toolsUsed: update.toolsUsed }),
      ...(update.startedAt !== undefined && { startedAt: update.startedAt }),
      ...(update.finishedAt !== undefined && { finishedAt: update.finishedAt }),
    })
    .where(eq(schema.agentTasks.id, taskId))
    .returning()

  const [task] = rows
  if (task) {
    await publishTaskUpdate(task as unknown as Record<string, unknown>)
  }
}

// ── Worker factory ────────────────────────────────────────────────────────────

/**
 * Starts the BullMQ Worker that processes all agent jobs.
 * Dynamic imports are used for each agent module to avoid circular dependencies
 * and to allow agents to be loaded lazily.
 */
export function startAgentWorker() {
  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const jobData = job.data as { taskId: string; userId: string; [k: string]: unknown }
      const { taskId, userId } = jobData

      await updateTask(taskId, { status: 'running', startedAt: new Date() })

      try {
        let result: Record<string, unknown>

        switch (job.name) {
          case 'intake': {
            const { runIntakeAgent } = await import('../agents/intake.js')
            result = await runIntakeAgent(
              jobData as {
                taskId: string
                userId: string
                opportunityId: string
                url?: string
                text?: string
                filePath?: string
              },
            )
            break
          }

          case 'research': {
            const { runResearchAgent } = await import('../agents/research.js')
            result = await runResearchAgent(
              jobData as { taskId: string; userId: string; companyId: string },
            )
            break
          }

          case 'match': {
            const { runMatchAgent } = await import('../agents/match.js')
            result = await runMatchAgent(
              jobData as { taskId: string; userId: string; opportunityId: string },
            )
            break
          }

          case 'resume': {
            const { runResumeAgent } = await import('../agents/resume.js')
            result = await runResumeAgent(
              jobData as { taskId: string; userId: string; opportunityId: string },
            )
            break
          }

          case 'cover': {
            const { runCoverAgent } = await import('../agents/cover.js')
            result = await runCoverAgent(
              jobData as {
                taskId: string
                userId: string
                opportunityId: string
                tone?: string
              },
            )
            break
          }

          case 'tracker': {
            const { runTrackerAgent } = await import('../agents/tracker.js')
            result = await runTrackerAgent(
              jobData as {
                taskId: string
                userId: string
                applicationId: string
                toStage: string
                note?: string
              },
            )
            break
          }

          default:
            throw new Error(`Unknown job name: ${job.name}`)
        }

        await updateTask(taskId, {
          status: 'succeeded',
          output: result,
          modelKind: (result.modelKind as 'local' | 'cloud') ?? undefined,
          modelName: (result.modelName as string) ?? undefined,
          costUsd: (result.costUsd as number) ?? 0,
          toolsUsed: (result.toolsUsed as string[]) ?? [],
          finishedAt: new Date(),
        })

        return result
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        await updateTask(taskId, { status: 'failed', error: msg, finishedAt: new Date() })
        // Re-throw so BullMQ records the failure and can retry if configured.
        throw err
      }
    },
    {
      // Share one ioredis connection via the URL string — BullMQ creates its own
      // internal connection from this config.
      connection: { url: config.redisUrl } as ConstructorParameters<typeof Redis>[0],
      concurrency: 3,
    },
  )

  worker.on('failed', (job, err) => {
    console.error(`[worker] job ${job?.name} (${job?.id}) failed:`, err.message)
  })

  worker.on('error', (err) => {
    console.error('[worker] worker error:', err.message)
  })

  console.log('[worker] agent worker started (concurrency=3)')
  return worker
}
