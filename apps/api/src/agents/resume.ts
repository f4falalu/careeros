// Resume Agent — tailors the user's master resume to a specific job posting.
// ⚠️  Highest-trust agent: runs a no-fabrication validator after every generation.
// Trigger: "tailor_resume" action, or POST /opportunities/:id/resume
// Validator: separate LLM pass that checks each bullet against the master profile.
//   - Violations do NOT block the save; they set validated=false and surface in output.
//   - The API must never return a PDF for an unvalidated resume without an explicit override flag.
// Writes: resume_versions row

import { z } from 'zod'
import { db, schema } from '../db/index.js'
import { eq } from 'drizzle-orm'
import { generateStructured, complete } from '../router/modelRouter.js'
import { markRunning, markSucceeded, markFailed } from './lib/task.js'

// ─────────────────────────────────────────────────────────────
// Output schemas
// ─────────────────────────────────────────────────────────────
const ResumeBulletSchema = z.object({
  text: z.string(),
  source_achievement_id: z.string().uuid().nullable().optional(),
})

const TailoredResumeSchema = z.object({
  label: z.string(),
  summary: z.string(),
  sections: z.record(z.array(ResumeBulletSchema)),
  keywords_targeted: z.array(z.string()),
  ats_score: z.number().min(0).max(100),
})

type TailoredResume = z.infer<typeof TailoredResumeSchema>

// ─────────────────────────────────────────────────────────────
// No-fabrication validator
// ─────────────────────────────────────────────────────────────
async function validateResume(
  resume: TailoredResume,
  profileFacts: string,
  userSkillNames: string[],
): Promise<{ valid: boolean; violations: string[] }> {
  const allBullets = Object.values(resume.sections).flat().map((b) => b.text)

  if (allBullets.length === 0) {
    return { valid: false, violations: ['No bullets generated'] }
  }

  const violations: string[] = []

  // Rule 1: every keyword claimed in the output must exist in the user's real skill set
  for (const kw of resume.keywords_targeted) {
    if (!userSkillNames.includes(kw.toLowerCase())) {
      violations.push(`Keyword claimed but not in profile: "${kw}"`)
    }
  }

  // Rule 2: LLM validator pass — verify each bullet against the master profile
  const prompt = `You are a resume fabrication detector. Check each bullet against the candidate's real profile. A bullet is VALID if it can be verified from the profile. A bullet is INVALID if it claims any employer, title, date, degree, metric, or skill not present in the profile.

Candidate profile facts:
${profileFacts.slice(0, 4_000)}

Resume bullets to check:
${allBullets.map((b, i) => `${i + 1}. ${b}`).join('\n')}

List only INVALID bullet numbers (e.g., "3, 7") or reply "ALL_VALID" if none are invalid. Nothing else.`

  const { text } = await complete(prompt, {
    taskType: 'resume_validate',
    containsPersonalData: true,
  })

  if (text.includes('ALL_VALID')) {
    return { valid: violations.length === 0, violations }
  }

  const invalidNums = text.match(/\d+/g)?.map(Number) ?? []
  for (const n of invalidNums) {
    const bullet = allBullets[n - 1]
    if (bullet) violations.push(`Unverifiable bullet: "${bullet.slice(0, 80)}"`)
  }

  return { valid: violations.length === 0, violations }
}

// ─────────────────────────────────────────────────────────────
// Agent entry point
// ─────────────────────────────────────────────────────────────
export async function runResumeAgent(input: {
  taskId: string
  userId: string
  opportunityId: string
}): Promise<Record<string, unknown>> {
  await markRunning(input.taskId)

  const [opportunity] = await db
    .select()
    .from(schema.opportunities)
    .where(eq(schema.opportunities.id, input.opportunityId))

  if (!opportunity) {
    await markFailed(input.taskId, 'Opportunity not found')
    return { error: 'Opportunity not found' }
  }

  // 1. Load candidate data
  const [profile] = await db
    .select()
    .from(schema.profiles)
    .where(eq(schema.profiles.userId, input.userId))

  const achievements = await db
    .select()
    .from(schema.achievements)
    .where(eq(schema.achievements.userId, input.userId))

  const skills = await db
    .select()
    .from(schema.skills)
    .where(eq(schema.skills.userId, input.userId))

  if (!profile && achievements.length === 0) {
    await markFailed(input.taskId, 'No profile or achievements found — cannot tailor resume')
    return { error: 'No profile data found' }
  }

  // 2. Build the canonical facts object the LLM is allowed to use
  const profileFacts = JSON.stringify({
    masterResume: profile?.masterResume ?? {},
    achievements: achievements.map((a) => ({
      id: a.id,
      summary: a.summary,
      detail: a.detail,
      skills: a.skills,
    })),
    skills: skills.map((s) => s.name),
  })

  const userSkillNames = skills.map((s) => s.name.toLowerCase())

  // 3. Determine version label
  const existing = await db
    .select()
    .from(schema.resumeVersions)
    .where(eq(schema.resumeVersions.userId, input.userId))

  const versionNum = existing.length + 1
  const label = `resume_v${versionNum}_${opportunity.roleTitle
    .toLowerCase()
    .replace(/\s+/g, '_')
    .slice(0, 20)}`

  // 4. Generate tailored resume
  const prompt = `You tailor an existing resume to a job. You may REFRAME, REORDER, and EMPHASIZE the candidate's real experience — you may NOT invent employers, titles, dates, degrees, metrics, or skills. Every line must be supported by a fact present in the master profile. Optimize for ATS: mirror the JD's exact skill keywords WHERE the candidate genuinely has them. Quantify using only metrics already in the profile.

Job: ${opportunity.roleTitle}
Required skills: ${(opportunity.requiredSkills ?? []).join(', ')}
Nice to have: ${(opportunity.niceToHaves ?? []).join(', ')}
Job description excerpt: ${(opportunity.description ?? '').slice(0, 2_000)}

Candidate profile (the ONLY facts you may use):
${profileFacts.slice(0, 5_000)}

Generate a tailored resume. Label: "${label}". ATS score: how well it matches the JD (0-100).`

  let resume: TailoredResume
  let modelKind: string
  let modelName: string

  try {
    const result = await generateStructured(prompt, TailoredResumeSchema, {
      taskType: 'resume',
      containsPersonalData: true,
      allowCloud: false,
    })
    resume = result.data
    modelKind = result.modelKind
    modelName = result.modelName
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await markFailed(input.taskId, `Resume generation failed: ${msg}`)
    return { error: `Resume generation failed: ${msg}` }
  }

  // 5. Run no-fabrication validator (non-blocking — violations flag the record, not block it)
  let valid = false
  let violations: string[] = []

  try {
    const result = await validateResume(resume, profileFacts, userSkillNames)
    valid = result.valid
    violations = result.violations
  } catch (err) {
    // Validator failure is logged but does not block the save
    violations = [`Validator error: ${err instanceof Error ? err.message : String(err)}`]
    valid = false
  }

  // 6. Persist resume version (always saved; validated flag signals trustworthiness)
  const [version] = await db
    .insert(schema.resumeVersions)
    .values({
      userId: input.userId,
      opportunityId: input.opportunityId,
      label: resume.label,
      content: resume as unknown as Record<string, unknown>,
      atsScore: String(resume.ats_score),
      validated: valid,
    })
    .returning()

  const output = {
    resumeVersionId: version.id,
    label: resume.label,
    validated: valid,
    atsScore: resume.ats_score,
    violations: valid ? [] : violations,
    warningMessage: valid
      ? null
      : `Resume not validated — ${violations.length} issue(s) found. Violations: ${violations.join('; ')}`,
  }

  await markSucceeded(input.taskId, {
    output,
    modelKind,
    modelName,
    toolsUsed: ['db_profile', 'db_achievements', 'resume_validator'],
    costUsd: 0,
  })

  return {
    ...output,
    modelKind,
    modelName,
    toolsUsed: ['db_profile', 'db_achievements', 'resume_validator'],
    costUsd: 0,
  }
}
