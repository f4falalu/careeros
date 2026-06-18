// Match Agent — scores an opportunity against the user's profile, achievements, and skills.
// Trigger: auto-enqueued after Intake, or explicit POST /opportunities/:id/match
// Logic: deterministic skill-overlap score + LLM rationale.
// Writes: match_scores row; triggers inferStrengths + inferInterests; saves to Qdrant opportunity_context

import { z } from 'zod'
import { db, schema } from '../db/index.js'
import { eq, and, inArray } from 'drizzle-orm'
import { evaluateTarget } from '../lib/targeting.js'
import { generateStructured, embed } from '../router/modelRouter.js'
import { markRunning, markSucceeded, markFailed } from './lib/task.js'
import { qdrantUpsert } from '../lib/qdrant.js'
import { randomUUID } from 'crypto'
import type { MemoryService } from '../services/memory.js'
import type { GraphService } from '../services/graph.js'

// ─────────────────────────────────────────────────────────────
// Output schema
// ─────────────────────────────────────────────────────────────
const MatchRationaleSchema = z.object({
  rationale: z.string().max(500),
  strengths: z.array(z.string()),
  gaps: z.array(z.string()),
  recommendation: z.enum(['strong_fit', 'good_fit', 'stretch', 'unlikely']),
})

export async function runMatchAgent(
  input: {
    taskId: string
    userId: string
    opportunityId: string
  },
  memoryService?: MemoryService,
  graphService?: GraphService,
): Promise<Record<string, unknown>> {
  await markRunning(input.taskId)

  const [opportunity] = await db
    .select()
    .from(schema.opportunities)
    .where(eq(schema.opportunities.id, input.opportunityId))

  if (!opportunity) {
    await markFailed(input.taskId, 'Opportunity not found')
    return { error: 'Opportunity not found' }
  }

  // 1. Load candidate data via MemoryService if available
  let skills: string[]
  let achievementSummaries: string[]
  let profileSummary: string

  if (memoryService) {
    const ctx = await memoryService.assembleContext(input.userId, {
      entityType: 'opportunity',
      entityId: input.opportunityId,
    })
    skills = ctx.skills
    achievementSummaries = ctx.achievements.map((a) => a.summary)
    profileSummary = JSON.stringify((ctx.profile as Record<string, unknown>)?.masterResume ?? {}).slice(0, 3_000)
  } else {
    const [profile] = await db.select().from(schema.profiles).where(eq(schema.profiles.userId, input.userId))
    const achievements = await db.select().from(schema.achievements).where(eq(schema.achievements.userId, input.userId))
    const skillRows = await db.select().from(schema.skills).where(eq(schema.skills.userId, input.userId))
    skills = skillRows.map((s) => s.name)
    achievementSummaries = achievements.map((a) => a.summary)
    profileSummary = profile ? JSON.stringify(profile.masterResume).slice(0, 3_000) : achievementSummaries.join('\n').slice(0, 3_000)
  }

  // 2. Deterministic skill-overlap score
  const userSkillNames = skills.map((s) => s.toLowerCase())
  const requiredSkills: string[] = opportunity.requiredSkills ?? []
  const matched = requiredSkills.filter((s) => userSkillNames.includes(s.toLowerCase()))
  const missing = requiredSkills.filter((s) => !userSkillNames.includes(s.toLowerCase()))
  const overlapScore = requiredSkills.length > 0 ? (matched.length / requiredSkills.length) * 100 : 50
  const profileBonus = Math.min(achievementSummaries.length * 2, 10)
  const score = Math.min(100, Math.round(overlapScore + profileBonus))

  // 3. Link this opportunity to the user's active Job Targets (intent layer).
  // Runs BEFORE the LLM rationale: tiering/hard-gating is deterministic (lib/targeting.ts)
  // and must not be skipped when the rationale model is unavailable. Re-running match
  // re-links the *active* targets from scratch; links to paused targets are left intact.
  try {
    const capabilityScore = requiredSkills.length > 0 ? Math.round(overlapScore) : null
    const activeTargets = await db
      .select()
      .from(schema.jobTargets)
      .where(and(eq(schema.jobTargets.userId, input.userId), eq(schema.jobTargets.status, 'active')))

    const activeTargetIds = activeTargets.map((t) => t.id)
    if (activeTargetIds.length > 0) {
      await db
        .delete(schema.opportunityTargets)
        .where(
          and(
            eq(schema.opportunityTargets.opportunityId, input.opportunityId),
            inArray(schema.opportunityTargets.targetId, activeTargetIds),
          ),
        )
    }

    for (const target of activeTargets) {
      const result = evaluateTarget(target, opportunity, capabilityScore)
      if (!result) continue
      await db
        .insert(schema.opportunityTargets)
        .values({
          opportunityId: input.opportunityId,
          targetId: target.id,
          fitTier: result.tier,
          capabilityScore: capabilityScore != null ? String(capabilityScore) : null,
        })
        .onConflictDoNothing()
    }
  } catch (err) {
    console.error('[match] target linking error (non-blocking):', String(err))
  }

  // 4. LLM rationale (structured)
  const prompt = `You are evaluating fit between a candidate and a job. Be honest and concise.

Job: ${opportunity.roleTitle} (${opportunity.workModel ?? 'unknown'} work model)
Required skills: ${requiredSkills.join(', ') || 'not specified'}
Matched skills: ${matched.join(', ') || 'none'}
Missing skills: ${missing.join(', ') || 'none'}

Candidate profile summary:
${profileSummary || 'No profile data yet'}

Achievements:
${achievementSummaries.slice(0, 5).join('\n') || 'None yet'}

Return a JSON object with:
- rationale: 1-2 sentence honest fit assessment. No fabrication.
- strengths: array of 1-3 specific candidate strengths for this role.
- gaps: array of 1-3 concrete gaps to address (skills, experience, or context).
- recommendation: one of "strong_fit", "good_fit", "stretch", or "unlikely".`

  let rationale: string
  let strengths: string[]
  let gaps: string[]
  let recommendation: string
  let modelKind: string
  let modelName: string

  try {
    const result = await generateStructured(prompt, MatchRationaleSchema, {
      taskType: 'match',
      containsPersonalData: true,
      allowCloud: false,
    })
    rationale = result.data.rationale
    strengths = result.data.strengths
    gaps = result.data.gaps
    recommendation = result.data.recommendation
    modelKind = result.modelKind
    modelName = result.modelName
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await markFailed(input.taskId, `LLM rationale failed: ${msg}`)
    return { error: `LLM rationale failed: ${msg}` }
  }

  // 5. Persist match score
  await db.insert(schema.matchScores).values({
    opportunityId: input.opportunityId,
    score: String(score),
    missingSkills: missing,
    rationale: rationale.slice(0, 500),
  })

  const output = { score, matchedSkills: matched, missingSkills: missing, rationale, strengths, gaps, recommendation }

  // 5. Graph enrichment: inferStrengths + inferInterests
  if (graphService) {
    try {
      await graphService.inferStrengths(input.userId)
      await graphService.inferInterests(input.userId)
    } catch (err) {
      console.error('[match] graph infer error (non-blocking):', String(err))
    }
  }

  // 6. Save to Qdrant opportunity_context
  try {
    const matchText = `${opportunity.roleTitle} — score ${score}%. ${recommendation}. Matched: ${matched.join(', ')}. Missing: ${missing.join(', ')}. ${rationale}`
    const vector = await embed(matchText)
    await qdrantUpsert('opportunity_context', randomUUID(), vector, {
      userId: input.userId,
      entityType: 'opportunity',
      entityId: input.opportunityId,
      content: matchText,
      channel: null,
      agentName: 'match',
      createdAt: new Date().toISOString(),
      score,
    })
  } catch (err) {
    console.error('[match] qdrant upsert error (non-blocking):', String(err))
  }

  // 7. Save observation
  if (memoryService) {
    try {
      await memoryService.saveObservation(
        input.userId,
        'match',
        `Matched opportunity "${opportunity.roleTitle}" with score ${score}%. Missing: ${missing.join(', ') || 'none'}.`,
        'opportunity',
        input.opportunityId,
      )
    } catch (err) {
      console.error('[match] saveObservation error (non-blocking):', String(err))
    }
  }

  await markSucceeded(input.taskId, {
    output,
    modelKind,
    modelName,
    toolsUsed: ['memory_service', 'graph_infer', 'qdrant_opportunity_context'],
    costUsd: 0,
  })

  return { ...output, modelKind, modelName, toolsUsed: ['memory_service', 'graph_infer'], costUsd: 0 }
}
