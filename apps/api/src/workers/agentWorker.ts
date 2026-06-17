import { Worker } from 'bullmq'
import { QUEUE_NAME } from './queue.js'
import { config } from '../config.js'
import { db, schema } from '../db/index.js'
import { eq } from 'drizzle-orm'
import Redis from 'ioredis'
import { serializeAgentTask } from '../lib/serialize.js'
import { notifyUser, buildTaskNotification } from '../channels/notify.js'
import { memoryService, graphService } from '../services/index.js'

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
    await publishTaskUpdate(serializeAgentTask(task))
  }
}

// ── Agent-activity graph events ─────────────────────────────────────────────────

// Maps a succeeded job to a first-class graph event. Jobs not listed here
// (e.g. tracker, followup, intake) don't produce an activity node.
const ACTIVITY_MAP: Record<string, { kind: string; label: string }> = {
  resume: { kind: 'resume_tailored', label: 'Resume tailored' },
  match: { kind: 'match', label: 'Match analysis' },
  outreach: { kind: 'outreach', label: 'Outreach drafted' },
  research: { kind: 'research', label: 'Company research' },
  interview_brief: { kind: 'interview_brief', label: 'Interview brief' },
  vvp_generate: { kind: 'vvp_created', label: 'Value plan' },
}

/**
 * Writes a successful agent run into the career graph as an `agent_activity`
 * event node, linked to the opportunity/company it concerned. Best-effort —
 * a graph write failure must never fail the agent task.
 */
async function recordAgentActivity(
  jobName: string,
  jobData: Record<string, unknown>,
): Promise<void> {
  const spec = ACTIVITY_MAP[jobName]
  if (!spec) return
  const userId = jobData.userId as string

  let opportunityId = (jobData.opportunityId as string | undefined) ?? null
  const companyId = (jobData.companyId as string | undefined) ?? null
  let companyLabel: string | null = null

  // Resolve the opportunity for jobs that reference it indirectly.
  if (!opportunityId && typeof jobData.applicationId === 'string') {
    const [appRow] = await db
      .select({ opportunityId: schema.applications.opportunityId })
      .from(schema.applications)
      .where(eq(schema.applications.id, jobData.applicationId))
      .limit(1)
    opportunityId = appRow?.opportunityId ?? null
  }
  if (!opportunityId && typeof jobData.vvpId === 'string') {
    const [vvpRow] = await db
      .select({ opportunityId: schema.vvps.opportunityId })
      .from(schema.vvps)
      .where(eq(schema.vvps.id, jobData.vvpId))
      .limit(1)
    opportunityId = vvpRow?.opportunityId ?? null
  }

  // Build a label that names the target.
  let label = spec.label
  if (opportunityId) {
    const [opp] = await db
      .select({ roleTitle: schema.opportunities.roleTitle })
      .from(schema.opportunities)
      .where(eq(schema.opportunities.id, opportunityId))
      .limit(1)
    if (opp) label = `${spec.label} · ${opp.roleTitle}`
  } else if (companyId) {
    const [co] = await db
      .select({ name: schema.companies.name })
      .from(schema.companies)
      .where(eq(schema.companies.id, companyId))
      .limit(1)
    if (co) {
      companyLabel = co.name
      label = `${spec.label} · ${co.name}`
    }
  }

  await graphService.recordActivity(userId, {
    kind: spec.kind,
    label,
    opportunityId,
    companyId,
    companyLabel,
  })
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
              memoryService,
              graphService,
            )
            break
          }

          case 'research': {
            const { runResearchAgent } = await import('../agents/research.js')
            result = await runResearchAgent(
              jobData as { taskId: string; userId: string; companyId: string },
              memoryService,
              graphService,
            )
            break
          }

          case 'match': {
            const { runMatchAgent } = await import('../agents/match.js')
            result = await runMatchAgent(
              jobData as { taskId: string; userId: string; opportunityId: string },
              memoryService,
              graphService,
            )
            break
          }

          case 'resume': {
            const { runResumeAgent } = await import('../agents/resume.js')
            result = await runResumeAgent(
              jobData as { taskId: string; userId: string; opportunityId: string },
              memoryService,
              graphService,
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
              memoryService,
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

          case 'vvp_propose': {
            const { runVvpProposeAgent } = await import('../agents/vvp.js')
            result = await runVvpProposeAgent(
              jobData as { taskId: string; userId: string; opportunityId: string },
              memoryService,
            )
            break
          }

          case 'vvp_generate': {
            const { runVvpGenerateAgent } = await import('../agents/vvp.js')
            result = await runVvpGenerateAgent(
              jobData as { taskId: string; userId: string; vvpId: string; angleIndex: number },
              memoryService,
              graphService,
            )
            break
          }

          case 'outreach': {
            const { runOutreachAgent } = await import('../agents/outreach.js')
            result = await runOutreachAgent(
              jobData as {
                taskId: string
                userId: string
                opportunityId: string
                contactRole?: string
                channel?: string
                contactId?: string
              },
              memoryService,
              graphService,
            )
            break
          }

          case 'interview_brief': {
            const { runInterviewBriefAgent } = await import('../agents/interview.js')
            result = await runInterviewBriefAgent(
              jobData as { taskId: string; userId: string; applicationId: string },
              memoryService,
              graphService,
            )
            break
          }

          case 'mock_session': {
            const { runMockSessionAgent } = await import('../agents/interview.js')
            result = await runMockSessionAgent(
              jobData as {
                taskId: string
                userId: string
                interviewId: string
                question: string
                sessionId?: string
              },
            )
            break
          }

          case 'followup': {
            const { runFollowupAgent } = await import('../agents/followup.js')
            result = await runFollowupAgent(
              jobData as { taskId: string; userId: string; outreachId: string },
              memoryService,
            )
            break
          }

          case 'strategist': {
            const { runStrategistAgent } = await import('../agents/strategist.js')
            result = await runStrategistAgent(
              jobData as { taskId: string; userId: string },
              memoryService,
            )
            break
          }

          case 'apply': {
            const { runApplyAgent } = await import('../agents/apply.js')
            result = await runApplyAgent(
              jobData as {
                taskId: string
                userId: string
                opportunityId: string
                approved?: boolean
              },
            )
            break
          }

          case 'enrich': {
            const { runEnrichAgent } = await import('../agents/enrich.js')
            result = await runEnrichAgent(
              jobData as { taskId: string; userId: string; contactId: string },
              memoryService,
            )
            break
          }

          case 'scrape': {
            const { runScrapeAgent } = await import('../agents/scrape.js')
            result = await runScrapeAgent(
              jobData as { taskId: string; userId: string; url: string },
            )
            break
          }

          case 'resume_parse': {
            const { runResumeParserAgent } = await import('../agents/resumeParser.js')
            result = await runResumeParserAgent(
              jobData as { taskId: string; userId: string; pdfText: string },
            )
            break
          }

          default:
            throw new Error(`Unknown job name: ${job.name}`)
        }

        // Autonomy gate: an agent can park itself for human confirmation by
        // returning needsApproval. The task waits in `needs_approval` until the
        // owner approves it via POST /tasks/:id/approve (which re-enqueues it).
        if (result.needsApproval === true) {
          await updateTask(taskId, {
            status: 'needs_approval',
            output: result,
            finishedAt: new Date(),
          })
          const approvalMsg = buildTaskNotification(job.name, 'needs_approval', result)
          if (approvalMsg) notifyUser(userId, approvalMsg).catch((e) => console.error('[worker] notify error:', e))
          return result
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

        // Surface the run as a graph event (non-blocking).
        await recordAgentActivity(job.name, jobData).catch((e) =>
          console.error('[worker] recordAgentActivity error (non-blocking):', String(e)),
        )

        const successMsg = buildTaskNotification(job.name, 'succeeded', result)
        if (successMsg) notifyUser(userId, successMsg).catch((e) => console.error('[worker] notify error:', e))

        return result
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        // BullMQ retries (queue.ts: attempts/backoff). Only mark the task `failed`
        // on the last attempt; otherwise re-queue it so the UI doesn't flash failure
        // for a blip that self-heals on the next try.
        const maxAttempts = job.opts.attempts ?? 1
        const isFinalAttempt = job.attemptsMade + 1 >= maxAttempts
        await updateTask(taskId, {
          status: isFinalAttempt ? 'failed' : 'queued',
          error: msg,
          ...(isFinalAttempt ? { finishedAt: new Date() } : {}),
        })
        // Re-throw so BullMQ records the failure and schedules the retry.
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
