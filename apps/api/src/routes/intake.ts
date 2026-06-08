import { Hono } from 'hono'
import { z } from 'zod'
import { db, schema } from '../db/index.js'
import { enqueueAgent } from '../workers/queue.js'

const app = new Hono()

const VALID_CHANNELS = ['telegram', 'whatsapp', 'web', 'manual', 'job_board'] as const

const IntakeSchema = z
  .object({
    url: z.string().url().optional(),
    text: z.string().optional(),
    file_path: z.string().optional(),
    source_channel: z.enum(VALID_CHANNELS),
  })
  .refine((d) => d.url || d.text || d.file_path, {
    message: 'At least one of url, text, or file_path is required',
  })

// ── POST /intake ──────────────────────────────────────────────
app.post('/', async (c) => {
  const userId = c.get('userId')
  let body: z.infer<typeof IntakeSchema>
  try {
    body = IntakeSchema.parse(await c.req.json())
  } catch (err) {
    return c.json({ code: 'validation_error', message: String(err) }, 400)
  }

  // Insert a placeholder opportunity — the intake agent will fill in the real data
  const [opportunity] = await db
    .insert(schema.opportunities)
    .values({
      userId,
      roleTitle: 'Analyzing...',
      sourceChannel: body.source_channel,
      sourceUrl: body.url,
      description: body.text,
    })
    .returning()

  // Create the agent task
  const [task] = await db
    .insert(schema.agentTasks)
    .values({
      userId,
      agentName: 'intake',
      status: 'queued',
      sourceChannel: body.source_channel,
      relatedType: 'opportunity',
      relatedId: opportunity.id,
      input: {
        opportunityId: opportunity.id,
        url: body.url,
        text: body.text,
        filePath: body.file_path,
      },
    })
    .returning()

  await enqueueAgent('intake', {
    taskId: task.id,
    userId,
    opportunityId: opportunity.id,
    url: body.url,
    text: body.text,
    filePath: body.file_path,
  })

  return c.json({ opportunity, tasks: [task] }, 202)
})

export { app as intakeRoutes }
