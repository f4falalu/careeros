// Resume Parser Agent — extracts structured candidate profile data from resume text.
// Triggers: POST /profile/resume-import (file upload)
// Writes: nothing — the /resume-import/apply route writes to DB after user confirms.
// Output: full structured profile snapshot (hero, work, education, skills, projects)

import { z, type ZodType } from 'zod'
import { generateStructured } from '../router/modelRouter.js'
import { markRunning, markSucceeded } from './lib/task.js'

// ─────────────────────────────────────────────────────────────
// Output schema
// ─────────────────────────────────────────────────────────────

const WorkExpSchema = z.object({
  company_name: z.string(),
  title: z.string(),
  employment_type: z.string().nullable().optional(),
  start_date: z.string().nullable().optional(),
  end_date: z.string().nullable().optional(),
  is_current: z.boolean().default(false),
  location: z.string().nullable().optional(),
  bullets: z.array(z.string()).default([]),
  skills_extracted: z.array(z.string()).default([]),
})

const EducationSchema = z.object({
  institution: z.string(),
  degree: z.string().nullable().optional(),
  field: z.string().nullable().optional(),
  start_date: z.string().nullable().optional(),
  end_date: z.string().nullable().optional(),
  grade: z.string().nullable().optional(),
  activities: z.array(z.string()).default([]),
})

const ProjectSchema = z.object({
  title: z.string(),
  description: z.string().nullable().optional(),
  role: z.string().nullable().optional(),
  tools: z.array(z.string()).default([]),
  outcome: z.string().nullable().optional(),
  links: z.array(z.string()).default([]),
})

const ResumeParseSchema = z.object({
  headline: z.string().nullable().optional(),
  bio: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  work_auth: z.string().nullable().optional(),
  languages: z.array(z.string()).default([]),
  links: z.record(z.string().nullable()).default({}).transform(
    (r) => Object.fromEntries(Object.entries(r).filter(([, v]) => v !== null)) as Record<string, string>,
  ),
  work_experiences: z.array(WorkExpSchema).default([]),
  education: z.array(EducationSchema).default([]),
  skills: z.array(z.object({
    name: z.string(),
    years: z.number().nullable().optional(),
  })).default([]),
  projects: z.array(ProjectSchema).default([]),
})

export type ResumeParsed = z.infer<typeof ResumeParseSchema>

// ─────────────────────────────────────────────────────────────
// Agent entry point
// ─────────────────────────────────────────────────────────────

export async function runResumeParserAgent(input: {
  taskId: string
  userId: string
  pdfText: string
}): Promise<Record<string, unknown>> {
  await markRunning(input.taskId)

  if (input.pdfText.trim().length < 50) {
    throw new Error('Resume text too short to parse')
  }

  const prompt = `You extract structured candidate profile data from a resume. Never invent facts — only extract what is actually present. If a field is absent, return null or an empty array.

Rules:
- Dates: use YYYY-MM-DD if full date known, YYYY-MM if month+year, YYYY if year only, null if unknown.
- Skills: short canonical tokens ("Python", "PostgreSQL", "React") — no qualifiers like "experience with".
- Bullets: preserve each achievement verbatim as a concise bullet; do not merge or summarize.
- Headline: 1-line professional title from their most recent role (e.g. "Senior Product Manager · FinTech").
- Bio: 2-3 sentence professional summary; synthesize from the resume if not explicitly stated.
- Links: extract URLs (LinkedIn, GitHub, portfolio, etc.) as { key: url } pairs where key is one of: linkedin, github, portfolio, twitter, notion, other.
- work_auth: only populate if the resume explicitly mentions visa/authorization status.
- skills_extracted on each work experience: skills specifically mentioned or clearly implied by that role.

Resume text:
${input.pdfText.slice(0, 8_000)}

Extract the complete structured profile.`

  let parsed: ResumeParsed
  let modelKind: string
  let modelName: string

  try {
    const result = await generateStructured<ResumeParsed>(prompt, ResumeParseSchema as ZodType<ResumeParsed>, {
      taskType: 'resume_parse',
      containsPersonalData: true,
      allowCloud: true,
      userId: input.userId,
    })
    parsed = result.data
    modelKind = result.modelKind
    modelName = result.modelName
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`LLM parse failed: ${msg}`)
  }

  await markSucceeded(input.taskId, {
    output: parsed,
    modelKind,
    modelName,
    toolsUsed: [],
    costUsd: 0,
  })

  // Flatten parsed into the return so task.output is directly readable by the /apply route.
  return Object.assign({} as Record<string, unknown>, parsed, { modelKind, modelName, costUsd: 0 })
}
