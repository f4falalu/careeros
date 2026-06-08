import { Hono } from 'hono'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'

const app = new Hono()

// ── GET /achievements ─────────────────────────────────────────
app.get('/', async (c) => {
  const userId = c.get('userId')
  const rows = await db
    .select()
    .from(schema.achievements)
    .where(eq(schema.achievements.userId, userId))
  return c.json(rows)
})

// ── POST /achievements ────────────────────────────────────────
const AchievementInputSchema = z.object({
  summary: z.string().min(1),
  detail: z.string().optional(),
  skills: z.array(z.string()).optional(),
  metrics: z.record(z.unknown()).optional(),
})

app.post('/', async (c) => {
  const userId = c.get('userId')
  let body: z.infer<typeof AchievementInputSchema>
  try {
    body = AchievementInputSchema.parse(await c.req.json())
  } catch (err) {
    return c.json({ code: 'validation_error', message: String(err) }, 400)
  }

  const [created] = await db
    .insert(schema.achievements)
    .values({
      userId,
      summary: body.summary,
      detail: body.detail,
      skills: body.skills ?? [],
      metrics: body.metrics ?? {},
    })
    .returning()

  return c.json(created, 201)
})

export { app as achievementsRoutes }
