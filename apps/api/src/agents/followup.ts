import { z } from 'zod'
import { db, schema } from '../db/index.js'
import { eq } from 'drizzle-orm'
import { generateStructured } from '../router/modelRouter.js'
import { markRunning, markSucceeded, markFailed } from './lib/task.js'
import type { MemoryService } from '../services/memory.js'

// ─────────────────────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────────────────────

const FollowUpDraftSchema = z.object({
  subject: z.string(),
  body: z.string(),
})

const FollowUpSetSchema = z.object({
  day_3: FollowUpDraftSchema,
  day_7: FollowUpDraftSchema,
  day_14: FollowUpDraftSchema,
})

// ─────────────────────────────────────────────────────────────
// Follow-up Agent
// ─────────────────────────────────────────────────────────────

export async function runFollowupAgent(
  input: {
    taskId: string
    userId: string
    outreachId: string
  },
  memoryService?: MemoryService,
): Promise<Record<string, unknown>> {
  await markRunning(input.taskId)

  if (memoryService) {
    try {
      await memoryService.assembleContext(input.userId)
    } catch (err) {
      console.error('[followup] assembleContext error (non-blocking):', String(err))
    }
  }

  const [outreach] = await db
    .select()
    .from(schema.outreachMessages)
    .where(eq(schema.outreachMessages.id, input.outreachId))

  if (!outreach) {
    await markFailed(input.taskId, 'Outreach message not found')
    return { error: 'Outreach message not found' }
  }

  // Load opportunity context for grounding
  let opportunityContext = ''
  if (outreach.opportunityId) {
    const [opp] = await db
      .select()
      .from(schema.opportunities)
      .where(eq(schema.opportunities.id, outreach.opportunityId))
    if (opp) {
      opportunityContext = `Role: ${opp.roleTitle}${opp.seniority ? ` (${opp.seniority})` : ''}`
    }
  }

  const prompt = `You are a career coach drafting follow-up messages for a job application outreach.

Original outreach:
Subject: ${outreach.subject ?? 'N/A'}
Body: ${outreach.body.slice(0, 1_000)}

${opportunityContext}

Write 3 follow-up messages (day 3, day 7, day 14) that:
- Are brief (3-5 sentences each, under 100 words)
- Reference the original message naturally
- Add a new value or angle each time rather than just asking "did you see my message?"
- Remain professional, warm, and non-pushy

Day 3: a brief, friendly check-in showing continued interest
Day 7: offer something of value (a relevant insight, article topic, or offer to answer any questions)
Day 14: graceful final check-in that closes the loop without burning the bridge`

  let drafts: z.infer<typeof FollowUpSetSchema>
  let modelKind: string
  let modelName: string

  try {
    const result = await generateStructured(prompt, FollowUpSetSchema, {
      taskType: 'followup',
      containsPersonalData: false,
      allowCloud: true,
    })
    drafts = result.data
    modelKind = result.modelKind
    modelName = result.modelName
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await markFailed(input.taskId, `Follow-up generation failed: ${msg}`)
    return { error: `Follow-up generation failed: ${msg}` }
  }

  const now = new Date()
  const rows = [
    { days: 3, draft: drafts.day_3 },
    { days: 7, draft: drafts.day_7 },
    { days: 14, draft: drafts.day_14 },
  ]

  const inserted = await Promise.all(
    rows.map(({ days, draft }) => {
      const dueAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000)
      return db
        .insert(schema.followUps)
        .values({
          outreachId: input.outreachId,
          dueAt,
          draftedBody: `Subject: ${draft.subject}\n\n${draft.body}`,
          state: 'draft',
        })
        .returning()
        .then((r) => r[0])
    }),
  )

  const output = {
    outreachId: input.outreachId,
    followUpIds: inserted.map((r) => r.id),
    count: inserted.length,
  }

  if (memoryService) {
    try {
      await memoryService.saveObservation(
        input.userId,
        'followup',
        `Drafted ${inserted.length} follow-up messages for outreach ${input.outreachId} (day 3, 7, 14).`,
        'outreach',
        input.outreachId,
      )
    } catch (err) {
      console.error('[followup] saveObservation error (non-blocking):', String(err))
    }
  }

  await markSucceeded(input.taskId, {
    output,
    modelKind,
    modelName,
    toolsUsed: ['db_outreach'],
    costUsd: 0,
  })
  return { ...output, modelKind, modelName, toolsUsed: ['db_outreach'], costUsd: 0 }
}
