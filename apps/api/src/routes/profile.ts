import { Hono } from 'hono'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import type { InferInsertModel } from 'drizzle-orm'

const app = new Hono()

// ── GET /profile ──────────────────────────────────────────────
app.get('/', async (c) => {
  const userId = c.get('userId')
  const [profile] = await db
    .select()
    .from(schema.profiles)
    .where(eq(schema.profiles.userId, userId))
    .limit(1)

  if (!profile) {
    // Auto-create empty profile on first access
    const [created] = await db
      .insert(schema.profiles)
      .values({ userId, masterResume: {}, tonePrefs: {} })
      .returning()
    return c.json(created)
  }
  return c.json(profile)
})

// ── PUT /profile ──────────────────────────────────────────────
const ProfileInputSchema = z.object({
  master_resume: z.record(z.unknown()).optional(),
  tone_prefs: z.record(z.unknown()).optional(),
})

app.put('/', async (c) => {
  const userId = c.get('userId')
  let body: z.infer<typeof ProfileInputSchema>
  try {
    body = ProfileInputSchema.parse(await c.req.json())
  } catch (err) {
    return c.json({ code: 'validation_error', message: String(err) }, 400)
  }

  const updateValues: Partial<typeof schema.profiles.$inferInsert> = {
    updatedAt: new Date(),
  }
  if (body.master_resume !== undefined) updateValues.masterResume = body.master_resume
  if (body.tone_prefs !== undefined) updateValues.tonePrefs = body.tone_prefs

  // Upsert: update if exists, insert if not
  const existing = await db
    .select({ id: schema.profiles.id })
    .from(schema.profiles)
    .where(eq(schema.profiles.userId, userId))
    .limit(1)

  let result
  if (existing.length > 0) {
    ;[result] = await db
      .update(schema.profiles)
      .set(updateValues)
      .where(eq(schema.profiles.userId, userId))
      .returning()
  } else {
    ;[result] = await db
      .insert(schema.profiles)
      .values({
        userId,
        masterResume: body.master_resume ?? {},
        tonePrefs: body.tone_prefs ?? {},
      })
      .returning()
  }

  return c.json(result)
})

// ── GET /profile/skills ───────────────────────────────────────
app.get('/skills', async (c) => {
  const userId = c.get('userId')
  const rows = await db
    .select()
    .from(schema.skills)
    .where(eq(schema.skills.userId, userId))
  return c.json(rows)
})

// ── POST /profile/skills ──────────────────────────────────────
const SkillInputSchema = z.object({
  name: z.string().min(1),
  proficiency: z.number().int().min(1).max(5).optional(),
  years: z.number().min(0).max(50).optional(),
})

const SkillBulkSchema = z.union([SkillInputSchema, z.array(SkillInputSchema)])

app.post('/skills', async (c) => {
  const userId = c.get('userId')
  let raw: unknown
  try {
    raw = await c.req.json()
  } catch {
    return c.json({ code: 'validation_error', message: 'Invalid JSON' }, 400)
  }

  const parseResult = SkillBulkSchema.safeParse(raw)
  if (!parseResult.success) {
    return c.json({ code: 'validation_error', message: parseResult.error.message }, 400)
  }

  const items = Array.isArray(parseResult.data) ? parseResult.data : [parseResult.data]
  const rows: InferInsertModel<typeof schema.skills>[] = items.map((s) => ({
    userId,
    name: s.name,
    proficiency: s.proficiency !== undefined ? s.proficiency : null,
    years: s.years !== undefined ? String(s.years) : null,
  }))

  const inserted = await db
    .insert(schema.skills)
    .values(rows)
    .onConflictDoUpdate({
      target: [schema.skills.userId, schema.skills.name],
      set: {
        proficiency: schema.skills.proficiency,
        years: schema.skills.years,
      },
    })
    .returning()

  return c.json(inserted, 201)
})

export { app as profileRoutes }
