import { Hono } from 'hono'
import { z } from 'zod'
import { eq, and, asc } from 'drizzle-orm'
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
  headline: z.string().max(200).optional(),
  bio: z.string().max(2000).optional(),
  location: z.string().max(200).optional(),
  work_auth: z.string().max(100).optional(),
  languages: z.array(z.string()).optional(),
  links: z.record(z.string()).optional(),
  career_questions: z.record(z.unknown()).optional(),
  career_dna: z.record(z.unknown()).optional(),
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
  if (body.headline !== undefined) updateValues.headline = body.headline
  if (body.bio !== undefined) updateValues.bio = body.bio
  if (body.location !== undefined) updateValues.location = body.location
  if (body.work_auth !== undefined) updateValues.workAuth = body.work_auth
  if (body.languages !== undefined) updateValues.languages = body.languages
  if (body.links !== undefined) updateValues.links = body.links
  if (body.career_questions !== undefined) updateValues.careerQuestions = body.career_questions
  if (body.career_dna !== undefined) updateValues.careerDna = body.career_dna

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
        headline: body.headline,
        bio: body.bio,
        location: body.location,
        workAuth: body.work_auth,
        languages: body.languages ?? [],
        links: body.links ?? {},
        careerQuestions: body.career_questions ?? {},
        careerDna: body.career_dna ?? {},
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

// ── DELETE /profile/skills/:name ──────────────────────────────
app.delete('/skills/:name', async (c) => {
  const userId = c.get('userId')
  const name = decodeURIComponent(c.req.param('name'))
  await db
    .delete(schema.skills)
    .where(and(eq(schema.skills.userId, userId), eq(schema.skills.name, name)))
  return c.json({ deleted: name })
})

// ── Work Experiences ──────────────────────────────────────────

const WorkExpInputSchema = z.object({
  company_name: z.string().min(1).max(200),
  title: z.string().min(1).max(200),
  employment_type: z.string().max(100).optional(),
  start_date: z.string().optional().nullable(),
  end_date: z.string().optional().nullable(),
  is_current: z.boolean().optional(),
  location: z.string().max(200).optional().nullable(),
  bullets: z.array(z.string()).optional(),
  skills_extracted: z.array(z.string()).optional(),
  sort_order: z.number().int().min(0).optional(),
})

app.get('/work-experiences', async (c) => {
  const userId = c.get('userId')
  const rows = await db
    .select()
    .from(schema.workExperiences)
    .where(eq(schema.workExperiences.userId, userId))
    .orderBy(asc(schema.workExperiences.sortOrder), asc(schema.workExperiences.createdAt))
  return c.json(rows)
})

app.post('/work-experiences', async (c) => {
  const userId = c.get('userId')
  let body: z.infer<typeof WorkExpInputSchema>
  try {
    body = WorkExpInputSchema.parse(await c.req.json())
  } catch (err) {
    return c.json({ code: 'validation_error', message: String(err) }, 400)
  }

  const [row] = await db
    .insert(schema.workExperiences)
    .values({
      userId,
      companyName: body.company_name,
      title: body.title,
      employmentType: body.employment_type ?? null,
      startDate: body.start_date ?? null,
      endDate: body.end_date ?? null,
      isCurrent: body.is_current ?? false,
      location: body.location ?? null,
      bullets: body.bullets ?? [],
      skillsExtracted: body.skills_extracted ?? [],
      sortOrder: body.sort_order ?? 0,
    })
    .returning()

  return c.json(row, 201)
})

app.put('/work-experiences/:id', async (c) => {
  const userId = c.get('userId')
  const { id } = c.req.param()
  let body: z.infer<typeof WorkExpInputSchema>
  try {
    body = WorkExpInputSchema.parse(await c.req.json())
  } catch (err) {
    return c.json({ code: 'validation_error', message: String(err) }, 400)
  }

  const [existing] = await db
    .select({ id: schema.workExperiences.id })
    .from(schema.workExperiences)
    .where(eq(schema.workExperiences.id, id))
    .limit(1)

  if (!existing) return c.json({ code: 'not_found' }, 404)

  const [row] = await db
    .update(schema.workExperiences)
    .set({
      companyName: body.company_name,
      title: body.title,
      employmentType: body.employment_type ?? null,
      startDate: body.start_date ?? null,
      endDate: body.end_date ?? null,
      isCurrent: body.is_current ?? false,
      location: body.location ?? null,
      bullets: body.bullets ?? [],
      skillsExtracted: body.skills_extracted ?? [],
      sortOrder: body.sort_order ?? 0,
    })
    .where(eq(schema.workExperiences.id, id))
    .returning()

  return c.json(row)
})

app.delete('/work-experiences/:id', async (c) => {
  const userId = c.get('userId')
  const { id } = c.req.param()

  const [existing] = await db
    .select({ userId: schema.workExperiences.userId })
    .from(schema.workExperiences)
    .where(eq(schema.workExperiences.id, id))
    .limit(1)

  if (!existing || existing.userId !== userId) return c.json({ code: 'not_found' }, 404)

  await db.delete(schema.workExperiences).where(eq(schema.workExperiences.id, id))
  return c.json({ deleted: id })
})

// ── Education ─────────────────────────────────────────────────

const EducationInputSchema = z.object({
  institution: z.string().min(1).max(300),
  degree: z.string().max(200).optional().nullable(),
  field: z.string().max(200).optional().nullable(),
  start_date: z.string().optional().nullable(),
  end_date: z.string().optional().nullable(),
  grade: z.string().max(100).optional().nullable(),
  activities: z.array(z.string()).optional(),
  sort_order: z.number().int().min(0).optional(),
})

app.get('/education', async (c) => {
  const userId = c.get('userId')
  const rows = await db
    .select()
    .from(schema.educations)
    .where(eq(schema.educations.userId, userId))
    .orderBy(asc(schema.educations.sortOrder), asc(schema.educations.createdAt))
  return c.json(rows)
})

app.post('/education', async (c) => {
  const userId = c.get('userId')
  let body: z.infer<typeof EducationInputSchema>
  try {
    body = EducationInputSchema.parse(await c.req.json())
  } catch (err) {
    return c.json({ code: 'validation_error', message: String(err) }, 400)
  }

  const [row] = await db
    .insert(schema.educations)
    .values({
      userId,
      institution: body.institution,
      degree: body.degree ?? null,
      field: body.field ?? null,
      startDate: body.start_date ?? null,
      endDate: body.end_date ?? null,
      grade: body.grade ?? null,
      activities: body.activities ?? [],
      sortOrder: body.sort_order ?? 0,
    })
    .returning()

  return c.json(row, 201)
})

app.put('/education/:id', async (c) => {
  const userId = c.get('userId')
  const { id } = c.req.param()
  let body: z.infer<typeof EducationInputSchema>
  try {
    body = EducationInputSchema.parse(await c.req.json())
  } catch (err) {
    return c.json({ code: 'validation_error', message: String(err) }, 400)
  }

  const [existing] = await db
    .select({ userId: schema.educations.userId })
    .from(schema.educations)
    .where(eq(schema.educations.id, id))
    .limit(1)

  if (!existing || existing.userId !== userId) return c.json({ code: 'not_found' }, 404)

  const [row] = await db
    .update(schema.educations)
    .set({
      institution: body.institution,
      degree: body.degree ?? null,
      field: body.field ?? null,
      startDate: body.start_date ?? null,
      endDate: body.end_date ?? null,
      grade: body.grade ?? null,
      activities: body.activities ?? [],
      sortOrder: body.sort_order ?? 0,
    })
    .where(eq(schema.educations.id, id))
    .returning()

  return c.json(row)
})

app.delete('/education/:id', async (c) => {
  const userId = c.get('userId')
  const { id } = c.req.param()

  const [existing] = await db
    .select({ userId: schema.educations.userId })
    .from(schema.educations)
    .where(eq(schema.educations.id, id))
    .limit(1)

  if (!existing || existing.userId !== userId) return c.json({ code: 'not_found' }, 404)

  await db.delete(schema.educations).where(eq(schema.educations.id, id))
  return c.json({ deleted: id })
})

// ── Profile Projects ──────────────────────────────────────────

const ProjectInputSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  role: z.string().max(200).optional().nullable(),
  tools: z.array(z.string()).optional(),
  outcome: z.string().max(1000).optional().nullable(),
  links: z.array(z.string()).optional(),
  sort_order: z.number().int().min(0).optional(),
})

app.get('/projects', async (c) => {
  const userId = c.get('userId')
  const rows = await db
    .select()
    .from(schema.profileProjects)
    .where(eq(schema.profileProjects.userId, userId))
    .orderBy(asc(schema.profileProjects.sortOrder), asc(schema.profileProjects.createdAt))
  return c.json(rows)
})

app.post('/projects', async (c) => {
  const userId = c.get('userId')
  let body: z.infer<typeof ProjectInputSchema>
  try {
    body = ProjectInputSchema.parse(await c.req.json())
  } catch (err) {
    return c.json({ code: 'validation_error', message: String(err) }, 400)
  }

  const [row] = await db
    .insert(schema.profileProjects)
    .values({
      userId,
      title: body.title,
      description: body.description ?? null,
      role: body.role ?? null,
      tools: body.tools ?? [],
      outcome: body.outcome ?? null,
      links: body.links ?? [],
      sortOrder: body.sort_order ?? 0,
    })
    .returning()

  return c.json(row, 201)
})

app.put('/projects/:id', async (c) => {
  const userId = c.get('userId')
  const { id } = c.req.param()
  let body: z.infer<typeof ProjectInputSchema>
  try {
    body = ProjectInputSchema.parse(await c.req.json())
  } catch (err) {
    return c.json({ code: 'validation_error', message: String(err) }, 400)
  }

  const [existing] = await db
    .select({ userId: schema.profileProjects.userId })
    .from(schema.profileProjects)
    .where(eq(schema.profileProjects.id, id))
    .limit(1)

  if (!existing || existing.userId !== userId) return c.json({ code: 'not_found' }, 404)

  const [row] = await db
    .update(schema.profileProjects)
    .set({
      title: body.title,
      description: body.description ?? null,
      role: body.role ?? null,
      tools: body.tools ?? [],
      outcome: body.outcome ?? null,
      links: body.links ?? [],
      sortOrder: body.sort_order ?? 0,
    })
    .where(eq(schema.profileProjects.id, id))
    .returning()

  return c.json(row)
})

app.delete('/projects/:id', async (c) => {
  const userId = c.get('userId')
  const { id } = c.req.param()

  const [existing] = await db
    .select({ userId: schema.profileProjects.userId })
    .from(schema.profileProjects)
    .where(eq(schema.profileProjects.id, id))
    .limit(1)

  if (!existing || existing.userId !== userId) return c.json({ code: 'not_found' }, 404)

  await db.delete(schema.profileProjects).where(eq(schema.profileProjects.id, id))
  return c.json({ deleted: id })
})

export { app as profileRoutes }
