// Match Agent — scores an opportunity against the user's profile, achievements, and skills.
// Trigger: auto-enqueued after Intake, or explicit POST /opportunities/:id/match
// Logic: deterministic skill-overlap score + LLM rationale (LLM only writes the explanation).
// Writes: match_scores row

import { z } from 'zod'
import { db, schema } from '../db/index.js'
import { eq } from 'drizzle-orm'
import { complete } from '../router/modelRouter.js'
import { markRunning, markSucceeded, markFailed } from './lib/task.js'

// ─────────────────────────────────────────────────────────────
// Agent entry point
// ─────────────────────────────────────────────────────────────
export async function runMatchAgent(input: {
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

  // 2. Deterministic skill-overlap score
  const userSkillNames = skills.map((s) => s.name.toLowerCase())
  const requiredSkills: string[] = opportunity.requiredSkills ?? []

  const matched = requiredSkills.filter((s) => userSkillNames.includes(s.toLowerCase()))
  const missing = requiredSkills.filter((s) => !userSkillNames.includes(s.toLowerCase()))

  const overlapScore =
    requiredSkills.length > 0 ? (matched.length / requiredSkills.length) * 100 : 50

  // Profile-depth bonus: more achievements → more evidence of experience
  const profileBonus = Math.min(achievements.length * 2, 10)
  const score = Math.min(100, Math.round(overlapScore + profileBonus))

  // 3. LLM writes the rationale only (the number is already computed above)
  const profileSummary = profile
    ? JSON.stringify(profile.masterResume).slice(0, 3_000)
    : achievements
        .map((a) => a.summary)
        .join('\n')
        .slice(0, 3_000)

  const prompt = `You are evaluating fit between a candidate and a job. Be honest and concise.

Job: ${opportunity.roleTitle} (${opportunity.workModel ?? 'unknown'} work model)
Required skills: ${requiredSkills.join(', ') || 'not specified'}
Matched skills: ${matched.join(', ') || 'none'}
Missing skills: ${missing.join(', ') || 'none'}

Candidate profile summary:
${profileSummary || 'No profile data yet'}

Achievements:
${achievements
  .slice(0, 5)
  .map((a) => a.summary)
  .join('\n') || 'None yet'}

Write 1-2 sentences: honest fit assessment based on skill overlap and profile. No fabrication.`

  let rationale: string
  let modelKind: string
  let modelName: string

  try {
    const result = await complete(prompt, {
      taskType: 'match',
      containsPersonalData: true,
      allowCloud: false,
    })
    rationale = result.text
    modelKind = result.modelKind
    modelName = result.modelName
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await markFailed(input.taskId, `LLM rationale failed: ${msg}`)
    return { error: `LLM rationale failed: ${msg}` }
  }

  // 4. Persist match score
  await db.insert(schema.matchScores).values({
    opportunityId: input.opportunityId,
    score: String(score),
    missingSkills: missing,
    rationale: rationale.slice(0, 500),
  })

  const output = {
    score,
    matchedSkills: matched,
    missingSkills: missing,
    rationale,
  }

  await markSucceeded(input.taskId, {
    output,
    modelKind,
    modelName,
    toolsUsed: ['db_profile', 'db_achievements', 'db_skills'],
    costUsd: 0,
  })

  return {
    ...output,
    modelKind,
    modelName,
    toolsUsed: ['db_profile', 'db_achievements', 'db_skills'],
    costUsd: 0,
  }
}
