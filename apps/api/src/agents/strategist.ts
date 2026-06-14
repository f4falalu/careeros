import { z } from 'zod'
import { db, schema } from '../db/index.js'
import { eq } from 'drizzle-orm'
import { generateStructured } from '../router/modelRouter.js'
import { markRunning, markSucceeded, markFailed } from './lib/task.js'
import type { MemoryService, AssembledContext } from '../services/memory.js'

// ─────────────────────────────────────────────────────────────
// Schema
// ─────────────────────────────────────────────────────────────

const StrategistReportSchema = z.object({
  pipeline_health: z.object({
    summary: z.string(),
    velocity_assessment: z.string(),
  }),
  skill_gaps: z.array(
    z.object({
      skill: z.string(),
      frequency: z.number(),
      priority: z.enum(['high', 'medium', 'low']),
      suggestion: z.string(),
    }),
  ),
  targeting_advice: z.object({
    focus_roles: z.array(z.string()),
    avoid_patterns: z.array(z.string()),
    sweet_spot: z.string(),
  }),
  actionable_suggestions: z.array(z.string()),
})

// ─────────────────────────────────────────────────────────────
// Strategist Agent
// ─────────────────────────────────────────────────────────────

export async function runStrategistAgent(
  input: {
    taskId: string
    userId: string
  },
  memoryService?: MemoryService,
): Promise<Record<string, unknown>> {
  await markRunning(input.taskId)

  // Assemble context via MemoryService (satisfies Req 42; provides skills without direct db query)
  let ctx: AssembledContext | null = null
  if (memoryService) {
    try {
      ctx = await memoryService.assembleContext(input.userId)
    } catch (err) {
      console.error('[strategist] assembleContext error (non-blocking):', String(err))
    }
  }

  const [applications, opportunities] = await Promise.all([
    db.select().from(schema.applications).where(eq(schema.applications.userId, input.userId)),
    db.select().from(schema.opportunities).where(eq(schema.opportunities.userId, input.userId)),
  ])

  // Load match scores for each opportunity
  const allMatchScores: Array<{ missingSkills: string[] | null; score: string | null }> = []
  for (const opp of opportunities.slice(0, 50)) {
    const [ms] = await db
      .select()
      .from(schema.matchScores)
      .where(eq(schema.matchScores.opportunityId, opp.id))
      .limit(1)
    if (ms) allMatchScores.push(ms)
  }

  // Aggregate missing skill frequency
  const skillGapFreq: Record<string, number> = {}
  for (const ms of allMatchScores) {
    for (const skill of ms.missingSkills ?? []) {
      skillGapFreq[skill] = (skillGapFreq[skill] ?? 0) + 1
    }
  }

  // Stage distribution
  const stageDist: Record<string, number> = {}
  for (const app of applications) {
    stageDist[app.stage] = (stageDist[app.stage] ?? 0) + 1
  }

  // Average match score
  const scores = allMatchScores
    .map((ms) => parseFloat(ms.score ?? '0'))
    .filter((s) => s > 0)
  const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null

  const rolesList = opportunities
    .slice(0, 20)
    .map((o) => `- ${o.roleTitle}${o.seniority ? ` (${o.seniority})` : ''}`)
    .join('\n')

  const skillGapList = Object.entries(skillGapFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([skill, count]) => `${skill} (missing in ${count} opp${count > 1 ? 's' : ''})`)
    .join(', ')

  const currentSkills = (ctx?.skills ?? []).join(', ')

  const prompt = `You are a senior career strategist. Analyze this job seeker's pipeline and provide strategic advice.

Pipeline summary:
- Total applications: ${applications.length}
- Stage distribution: ${JSON.stringify(stageDist)}
- Average match score: ${avgScore !== null ? `${avgScore.toFixed(1)}%` : 'not available'}

Roles being pursued (sample):
${rolesList || 'No roles tracked yet.'}

Skill gaps (from match scoring, sorted by frequency):
${skillGapList || 'No skill gap data yet.'}

Current skills: ${currentSkills || 'No skills data yet.'}

Provide:
1. Pipeline health: a candid summary of how the funnel is performing + velocity assessment
2. Skill gaps: top gaps to close (prioritized high/medium/low), each with a concrete learning suggestion
3. Targeting advice: what role types to focus on vs. patterns to avoid + a "sweet spot" description
4. 3-5 concrete, actionable suggestions the job seeker can act on this week

Be direct and specific. Reference the actual data above.`

  let report: z.infer<typeof StrategistReportSchema>
  let modelKind: string
  let modelName: string

  try {
    const result = await generateStructured(prompt, StrategistReportSchema, {
      taskType: 'strategist',
      containsPersonalData: false,
      allowCloud: true,
    })
    report = result.data
    modelKind = result.modelKind
    modelName = result.modelName
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await markFailed(input.taskId, `Strategist analysis failed: ${msg}`)
    return { error: `Strategist analysis failed: ${msg}` }
  }

  const output = {
    report,
    meta: {
      applicationsCount: applications.length,
      stageDist,
      avgMatchScore: avgScore,
      skillGapsAnalyzed: Object.keys(skillGapFreq).length,
    },
  }

  if (memoryService) {
    try {
      const topGaps = report.skill_gaps.slice(0, 3).map((g) => g.skill).join(', ')
      await memoryService.saveObservation(
        input.userId,
        'strategist',
        `Career strategy analysis: ${applications.length} applications, avg score ${avgScore !== null ? `${avgScore.toFixed(1)}%` : 'N/A'}. Top skill gaps: ${topGaps || 'none'}.`,
      )
    } catch (err) {
      console.error('[strategist] saveObservation error (non-blocking):', String(err))
    }
  }

  await markSucceeded(input.taskId, {
    output,
    modelKind,
    modelName,
    toolsUsed: ['db_pipeline', 'db_skills', 'db_match_scores'],
    costUsd: 0,
  })
  return { ...output, modelKind, modelName, toolsUsed: ['db_pipeline', 'db_skills'], costUsd: 0 }
}
