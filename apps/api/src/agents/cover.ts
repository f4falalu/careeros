// Cover Letter Agent — drafts a cover letter / application email grounded in real facts.
// Trigger: "cover_letter" action, or POST /opportunities/:id/cover-letter
// Tone: pulled from profile.tonePrefs, overridable by caller.
// Guardrail: prompt explicitly forbids fabrication; uses only profile + achievements + company brief.
// Writes: cover_letters row

import { z } from 'zod'
import { db, schema } from '../db/index.js'
import { eq } from 'drizzle-orm'
import { generateStructured } from '../router/modelRouter.js'
import { markRunning, markSucceeded, markFailed } from './lib/task.js'

// ─────────────────────────────────────────────────────────────
// Output schema
// ─────────────────────────────────────────────────────────────
const CoverLetterSchema = z.object({
  tone: z.enum(['formal', 'warm', 'direct']),
  subject: z.string().nullable().optional(),
  body: z.string().max(2_000),
})

type CoverLetter = z.infer<typeof CoverLetterSchema>

// ─────────────────────────────────────────────────────────────
// Agent entry point
// ─────────────────────────────────────────────────────────────
export async function runCoverAgent(input: {
  taskId: string
  userId: string
  opportunityId: string
  tone?: string
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

  // 2. Resolve tone: caller override > profile prefs > default 'warm'
  const profileToneDefault =
    (profile?.tonePrefs as Record<string, unknown> | null)?.default ?? 'warm'
  const tone = (input.tone ?? profileToneDefault ?? 'warm') as 'formal' | 'warm' | 'direct'

  // 3. Enrich with company brief (if available)
  let briefSnippet = ''
  if (opportunity.companyId) {
    const [brief] = await db
      .select()
      .from(schema.companyBriefs)
      .where(eq(schema.companyBriefs.companyId, opportunity.companyId))

    if (brief) {
      const content = brief.content as Record<string, unknown>
      const products = (content.products as string[] | undefined) ?? []
      briefSnippet = [
        content.business_model ? `Business model: ${content.business_model}` : null,
        products.length > 0 ? `Key products: ${products.slice(0, 3).join(', ')}` : null,
        content.funding ? `Funding: ${content.funding}` : null,
      ]
        .filter(Boolean)
        .join('. ')
    }
  }

  // 4. Build profile snippet from achievements (fall back to master resume)
  const profileSnippet =
    achievements.length > 0
      ? achievements
          .slice(0, 5)
          .map((a) => a.summary)
          .join('\n')
      : JSON.stringify(profile?.masterResume ?? {}).slice(0, 1_000)

  // 5. Generate cover letter
  const prompt = `Write a cover letter / application email in ${tone} tone. Ground specifics in the company brief and the candidate's REAL experience. No fabricated achievements. Keep it under 250 words.

Job: ${opportunity.roleTitle}
${briefSnippet ? `Company context: ${briefSnippet}` : ''}
Required skills: ${(opportunity.requiredSkills ?? []).join(', ')}

Candidate achievements (real facts only):
${profileSnippet}

Generate a cover letter with a subject line.`

  let cover: CoverLetter
  let modelKind: string
  let modelName: string

  try {
    const result = await generateStructured(prompt, CoverLetterSchema, {
      taskType: 'cover',
      containsPersonalData: true,
      allowCloud: false,
    })
    cover = result.data
    modelKind = result.modelKind
    modelName = result.modelName
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await markFailed(input.taskId, `Cover letter generation failed: ${msg}`)
    return { error: `Cover letter generation failed: ${msg}` }
  }

  // 6. Persist cover letter
  const [saved] = await db
    .insert(schema.coverLetters)
    .values({
      userId: input.userId,
      opportunityId: input.opportunityId,
      tone: cover.tone,
      body: cover.body,
    })
    .returning()

  const output = {
    coverLetterId: saved.id,
    tone: cover.tone,
    subject: cover.subject ?? null,
    body: cover.body,
  }

  await markSucceeded(input.taskId, {
    output,
    modelKind,
    modelName,
    toolsUsed: ['db_profile', 'db_achievements'],
    costUsd: 0,
  })

  return {
    ...output,
    modelKind,
    modelName,
    toolsUsed: ['db_profile', 'db_achievements'],
    costUsd: 0,
  }
}
