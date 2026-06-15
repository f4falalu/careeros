import { Hono } from 'hono'
import { z } from 'zod'
import { db, schema } from '../db/index.js'
import { eq, and } from 'drizzle-orm'
import { enqueueAgent } from '../workers/queue.js'
import type { ResumeParsed } from '../agents/resumeParser.js'

const app = new Hono()

const MAX_FILE_BYTES = 5 * 1024 * 1024 // 5 MB

// ── POST /profile/resume-import ───────────────────────────────
// Accepts a PDF or DOCX, extracts text, enqueues the resume_parse agent.
// Returns { taskId } immediately — client polls /tasks/:id.
app.post('/', async (c) => {
  const userId = c.get('userId')

  let formData: FormData
  try {
    formData = await c.req.formData()
  } catch {
    return c.json({ code: 'bad_request', message: 'Expected multipart/form-data' }, 400)
  }

  const file = formData.get('file')
  if (!(file instanceof File)) {
    return c.json({ code: 'bad_request', message: 'Field "file" is required' }, 400)
  }

  const nameLower = file.name.toLowerCase()
  const isPdf = nameLower.endsWith('.pdf') || file.type === 'application/pdf'
  const isDocx =
    nameLower.endsWith('.docx') ||
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

  if (!isPdf && !isDocx) {
    return c.json({ code: 'bad_request', message: 'Only PDF and DOCX files are accepted' }, 400)
  }

  if (file.size > MAX_FILE_BYTES) {
    return c.json({ code: 'bad_request', message: 'File must be under 5 MB' }, 400)
  }

  const arrayBuffer = await file.arrayBuffer()
  let resumeText: string

  if (isPdf) {
    const { extractText } = await import('unpdf')
    try {
      const result = await extractText(new Uint8Array(arrayBuffer), { mergePages: true })
      resumeText = Array.isArray(result.text)
        ? result.text.join('\n\n')
        : String(result.text)
    } catch {
      return c.json({ code: 'parse_error', message: 'Could not read PDF — is it a text-based PDF?' }, 422)
    }
  } else {
    // DOCX
    const mammoth = await import('mammoth')
    try {
      const result = await mammoth.extractRawText({ buffer: Buffer.from(arrayBuffer) })
      resumeText = result.value
    } catch {
      return c.json({ code: 'parse_error', message: 'Could not read DOCX file' }, 422)
    }
  }

  const pdfText = resumeText // keep variable name for downstream compatibility

  if (pdfText.trim().length < 50) {
    return c.json({ code: 'parse_error', message: 'File appears to be empty or image-only' }, 422)
  }

  const [task] = await db
    .insert(schema.agentTasks)
    .values({
      userId,
      agentName: 'resume_parse',
      status: 'queued',
      sourceChannel: 'web',
      relatedType: 'profile',
      relatedId: userId,
      input: { fileName: file.name, textLength: pdfText.length },
    })
    .returning()

  await enqueueAgent('resume_parse', {
    taskId: task.id,
    userId,
    pdfText,
  })

  return c.json({ taskId: task.id }, 202)
})

// ── POST /profile/resume-import/apply ────────────────────────
// User confirms the parsed preview — writes everything to profile tables.
const ApplySchema = z.object({
  task_id: z.string().uuid(),
})

app.post('/apply', async (c) => {
  const userId = c.get('userId')
  let body: z.infer<typeof ApplySchema>
  try {
    body = ApplySchema.parse(await c.req.json())
  } catch (err) {
    return c.json({ code: 'validation_error', message: String(err) }, 400)
  }

  const [task] = await db
    .select()
    .from(schema.agentTasks)
    .where(and(
      eq(schema.agentTasks.id, body.task_id),
      eq(schema.agentTasks.userId, userId),
    ))
    .limit(1)

  if (!task) return c.json({ code: 'not_found' }, 404)
  if (task.agentName !== 'resume_parse') {
    return c.json({ code: 'bad_request', message: 'Not a resume parse task' }, 400)
  }
  if (task.status !== 'succeeded') {
    return c.json({ code: 'not_ready', message: `Task status: ${task.status}` }, 409)
  }

  const parsed = task.output as ResumeParsed

  // 1. Update hero / profile fields (only fields present in the parse)
  const heroUpdate: Record<string, unknown> = { updatedAt: new Date() }
  if (parsed.headline) heroUpdate.headline = parsed.headline
  if (parsed.bio) heroUpdate.bio = parsed.bio
  if (parsed.location) heroUpdate.location = parsed.location
  if (parsed.work_auth) heroUpdate.workAuth = parsed.work_auth
  if (parsed.languages?.length) heroUpdate.languages = parsed.languages
  if (parsed.links && Object.keys(parsed.links).length > 0) heroUpdate.links = parsed.links

  const [existingProfile] = await db
    .select({ id: schema.profiles.id })
    .from(schema.profiles)
    .where(eq(schema.profiles.userId, userId))
    .limit(1)

  if (existingProfile) {
    await db
      .update(schema.profiles)
      .set(heroUpdate)
      .where(eq(schema.profiles.userId, userId))
  } else {
    await db.insert(schema.profiles).values({
      userId,
      masterResume: {},
      tonePrefs: {},
      ...(heroUpdate as Record<string, never>),
    })
  }

  // 2. Work experiences — insert in order
  let workCount = 0
  if (parsed.work_experiences?.length) {
    for (let i = 0; i < parsed.work_experiences.length; i++) {
      const w = parsed.work_experiences[i]
      await db.insert(schema.workExperiences).values({
        userId,
        companyName: w.company_name,
        title: w.title,
        employmentType: w.employment_type ?? null,
        startDate: w.start_date ?? null,
        endDate: w.end_date ?? null,
        isCurrent: w.is_current ?? false,
        location: w.location ?? null,
        bullets: w.bullets ?? [],
        skillsExtracted: w.skills_extracted ?? [],
        sortOrder: i,
      })
      workCount++
    }
  }

  // 3. Education — insert in order
  let eduCount = 0
  if (parsed.education?.length) {
    for (let i = 0; i < parsed.education.length; i++) {
      const e = parsed.education[i]
      await db.insert(schema.educations).values({
        userId,
        institution: e.institution,
        degree: e.degree ?? null,
        field: e.field ?? null,
        startDate: e.start_date ?? null,
        endDate: e.end_date ?? null,
        grade: e.grade ?? null,
        activities: e.activities ?? [],
        sortOrder: i,
      })
      eduCount++
    }
  }

  // 4. Skills — upsert (ignore duplicates silently)
  let skillCount = 0
  if (parsed.skills?.length) {
    await db
      .insert(schema.skills)
      .values(
        parsed.skills.map((s) => ({
          userId,
          name: s.name,
          proficiency: null as number | null,
          years: s.years != null ? String(s.years) : null,
        }))
      )
      .onConflictDoNothing()
    skillCount = parsed.skills.length
  }

  // 5. Projects — insert in order
  let projectCount = 0
  if (parsed.projects?.length) {
    for (let i = 0; i < parsed.projects.length; i++) {
      const p = parsed.projects[i]
      await db.insert(schema.profileProjects).values({
        userId,
        title: p.title,
        description: p.description ?? null,
        role: p.role ?? null,
        tools: p.tools ?? [],
        outcome: p.outcome ?? null,
        links: p.links ?? [],
        sortOrder: i,
      })
      projectCount++
    }
  }

  return c.json({
    applied: true,
    counts: {
      workExperiences: workCount,
      education: eduCount,
      skills: skillCount,
      projects: projectCount,
    },
  })
})

export { app as resumeImportRoutes }
