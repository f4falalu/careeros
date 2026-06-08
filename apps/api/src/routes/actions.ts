import { Hono } from 'hono'
import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { enqueueAgent } from '../workers/queue.js'

const app = new Hono()

const VALID_ACTIONS = [
  'tailor_resume',
  'build_vvp',
  'draft_outreach',
  'cover_letter',
  'mark_applied',
] as const
type Action = (typeof VALID_ACTIONS)[number]

const VALID_CHANNELS = ['telegram', 'whatsapp', 'web', 'manual', 'job_board'] as const

const ActionsSchema = z.object({
  opportunity_id: z.string().uuid(),
  actions: z.array(z.enum(VALID_ACTIONS)).min(1),
  source_channel: z.enum(VALID_CHANNELS),
})

// ── POST /actions ─────────────────────────────────────────────
app.post('/', async (c) => {
  const userId = c.get('userId')
  let body: z.infer<typeof ActionsSchema>
  try {
    body = ActionsSchema.parse(await c.req.json())
  } catch (err) {
    return c.json({ code: 'validation_error', message: String(err) }, 400)
  }

  const { opportunity_id: opportunityId, actions, source_channel: sourceChannel } = body

  // Verify opportunity belongs to user
  const [opportunity] = await db
    .select()
    .from(schema.opportunities)
    .where(
      and(
        eq(schema.opportunities.id, opportunityId),
        eq(schema.opportunities.userId, userId),
      ),
    )
    .limit(1)

  if (!opportunity) {
    return c.json({ code: 'not_found', message: 'Opportunity not found' }, 404)
  }

  const results: typeof schema.agentTasks.$inferSelect[] = []

  for (const action of actions) {
    switch (action) {
      case 'tailor_resume': {
        const [task] = await db
          .insert(schema.agentTasks)
          .values({
            userId,
            agentName: 'resume',
            status: 'queued',
            sourceChannel,
            relatedType: 'opportunity',
            relatedId: opportunityId,
            input: { opportunityId },
          })
          .returning()
        await enqueueAgent('resume', { taskId: task.id, userId, opportunityId })
        results.push(task)
        break
      }

      case 'cover_letter': {
        const [task] = await db
          .insert(schema.agentTasks)
          .values({
            userId,
            agentName: 'cover',
            status: 'queued',
            sourceChannel,
            relatedType: 'opportunity',
            relatedId: opportunityId,
            input: { opportunityId },
          })
          .returning()
        await enqueueAgent('cover', { taskId: task.id, userId, opportunityId })
        results.push(task)
        break
      }

      case 'mark_applied': {
        // Direct DB write — no agent needed
        // Upsert application at stage 'applied'
        const [existing] = await db
          .select()
          .from(schema.applications)
          .where(eq(schema.applications.opportunityId, opportunityId))
          .limit(1)

        if (existing) {
          const prevStage = existing.stage
          if (existing.stage !== 'applied') {
            await db
              .update(schema.applications)
              .set({ stage: 'applied', appliedAt: new Date() })
              .where(eq(schema.applications.id, existing.id))

            await db.insert(schema.stageEvents).values({
              applicationId: existing.id,
              fromStage: prevStage,
              toStage: 'applied',
              actor: `agent:actions`,
              note: `Marked applied via ${sourceChannel}`,
            })
          }
        } else {
          const [application] = await db
            .insert(schema.applications)
            .values({
              userId,
              opportunityId,
              stage: 'applied',
              appliedAt: new Date(),
            })
            .returning()

          await db.insert(schema.stageEvents).values({
            applicationId: application.id,
            fromStage: null,
            toStage: 'applied',
            actor: 'agent:actions',
            note: `Marked applied via ${sourceChannel}`,
          })
        }

        // Return a synthetic "completed" task record so response shape is consistent
        const [task] = await db
          .insert(schema.agentTasks)
          .values({
            userId,
            agentName: 'tracker',
            status: 'succeeded',
            sourceChannel,
            relatedType: 'opportunity',
            relatedId: opportunityId,
            input: { opportunityId, action: 'mark_applied' },
            output: { stage: 'applied' },
          })
          .returning()
        results.push(task)
        break
      }

      case 'build_vvp': {
        // Phase 2 stub — create a "failed" placeholder task with descriptive error
        const [task] = await db
          .insert(schema.agentTasks)
          .values({
            userId,
            agentName: 'vvp',
            status: 'failed',
            sourceChannel,
            relatedType: 'opportunity',
            relatedId: opportunityId,
            input: { opportunityId },
            error: 'VVP generation not yet implemented (Phase 2)',
          })
          .returning()
        results.push(task)
        break
      }

      case 'draft_outreach': {
        // Phase 2 stub
        const [task] = await db
          .insert(schema.agentTasks)
          .values({
            userId,
            agentName: 'outreach',
            status: 'failed',
            sourceChannel,
            relatedType: 'opportunity',
            relatedId: opportunityId,
            input: { opportunityId },
            error: 'Outreach drafting not yet implemented (Phase 2)',
          })
          .returning()
        results.push(task)
        break
      }
    }
  }

  return c.json(results, 202)
})

export { app as actionsRoutes }
