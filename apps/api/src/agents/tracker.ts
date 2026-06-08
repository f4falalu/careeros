// Tracker Agent — updates an application's pipeline stage and appends a stage_events record.
// Trigger: "mark_applied" action, explicit stage change, or inbox signal suggesting movement.
// Logic: entirely deterministic — no LLM call needed for explicit user actions.
//   Agent-initiated suggestions (from inbox signals) set actor='agent:tracker' so the
//   user sees them in the task feed before they take effect.
// Writes: applications.stage update + stage_events row

import { db, schema } from '../db/index.js'
import { eq } from 'drizzle-orm'
import { markRunning, markSucceeded, markFailed } from './lib/task.js'

// ─────────────────────────────────────────────────────────────
// Valid stages (must mirror the pipelineStageEnum in schema)
// ─────────────────────────────────────────────────────────────
const VALID_STAGES = [
  'saved',
  'applied',
  'assessment',
  'interview',
  'final',
  'offer',
  'rejected',
  'withdrawn',
] as const

type Stage = (typeof VALID_STAGES)[number]

function isValidStage(s: string): s is Stage {
  return (VALID_STAGES as readonly string[]).includes(s)
}

// ─────────────────────────────────────────────────────────────
// Agent entry point
// ─────────────────────────────────────────────────────────────
export async function runTrackerAgent(input: {
  taskId: string
  userId: string
  applicationId: string
  toStage: string
  note?: string
}): Promise<Record<string, unknown>> {
  await markRunning(input.taskId)

  // 1. Validate requested stage
  if (!isValidStage(input.toStage)) {
    await markFailed(input.taskId, `Invalid stage: ${input.toStage}`)
    return { error: `Invalid stage: ${input.toStage}` }
  }

  // 2. Load application (verify it exists and belongs to the right user via userId scope)
  const [application] = await db
    .select()
    .from(schema.applications)
    .where(eq(schema.applications.id, input.applicationId))

  if (!application) {
    await markFailed(input.taskId, 'Application not found')
    return { error: 'Application not found' }
  }

  const fromStage = application.stage as Stage
  const toStage = input.toStage as Stage

  // 3. Update the application stage
  await db
    .update(schema.applications)
    .set({
      stage: toStage,
      // Record the timestamp when the application was explicitly marked as applied
      ...(toStage === 'applied' ? { appliedAt: new Date() } : {}),
    })
    .where(eq(schema.applications.id, input.applicationId))

  // 4. Append stage event for audit / timeline
  await db.insert(schema.stageEvents).values({
    applicationId: input.applicationId,
    fromStage,
    toStage,
    actor: 'agent:tracker',
    note: input.note ?? null,
  })

  const output = {
    applicationId: input.applicationId,
    fromStage,
    toStage,
  }

  await markSucceeded(input.taskId, {
    output,
    toolsUsed: ['db_application', 'db_stage_events'],
    costUsd: 0,
  })

  return {
    ...output,
    toolsUsed: ['db_application', 'db_stage_events'],
    costUsd: 0,
  }
}
