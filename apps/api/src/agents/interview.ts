import { z } from 'zod'
import { db, schema } from '../db/index.js'
import { eq } from 'drizzle-orm'
import { generateStructured, embed } from '../router/modelRouter.js'
import { markRunning, markSucceeded, markFailed } from './lib/task.js'
import { qdrantUpsert } from '../lib/qdrant.js'
import { randomUUID } from 'crypto'
import type { MemoryService } from '../services/memory.js'
import type { GraphService } from '../services/graph.js'

// ─────────────────────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────────────────────

const InterviewBriefSchema = z.object({
  key_themes: z.array(z.string()),
  likely_questions: z.array(
    z.object({
      question: z.string(),
      category: z.enum(['behavioral', 'technical', 'situational', 'culture_fit']),
      hint: z.string(),
    }),
  ),
  star_stories: z.array(
    z.object({
      question_hook: z.string(),
      suggested_story: z.string(),
    }),
  ),
  company_angles: z.array(z.string()),
  red_flags_to_address: z.array(z.string()),
  opening_pitch: z.string(),
})

const MockAnswerSchema = z.object({
  ideal_answer: z.string(),
  coaching_tip: z.string(),
  follow_up_question: z.string().optional(),
})

// ─────────────────────────────────────────────────────────────
// Interview Brief Agent
// ─────────────────────────────────────────────────────────────

export async function runInterviewBriefAgent(
  input: {
    taskId: string
    userId: string
    applicationId: string
  },
  memoryService?: MemoryService,
  graphService?: GraphService,
): Promise<Record<string, unknown>> {
  await markRunning(input.taskId)

  const [application] = await db
    .select()
    .from(schema.applications)
    .where(eq(schema.applications.id, input.applicationId))

  if (!application) {
    await markFailed(input.taskId, 'Application not found')
    return { error: 'Application not found' }
  }

  const [opportunity] = await db
    .select()
    .from(schema.opportunities)
    .where(eq(schema.opportunities.id, application.opportunityId))

  if (!opportunity) {
    await markFailed(input.taskId, 'Opportunity not found')
    return { error: 'Opportunity not found' }
  }

  const toolsUsed = ['db_application', 'db_opportunity']

  // Load match score for gap awareness
  const [match] = await db
    .select()
    .from(schema.matchScores)
    .where(eq(schema.matchScores.opportunityId, opportunity.id))

  // Load company brief
  let briefContent: Record<string, unknown> = {}
  if (opportunity.companyId) {
    const [brief] = await db
      .select()
      .from(schema.companyBriefs)
      .where(eq(schema.companyBriefs.companyId, opportunity.companyId))
    if (brief) {
      briefContent = brief.content as Record<string, unknown>
      toolsUsed.push('db_brief')
    }
  }

  // Load profile + achievements via MemoryService if available
  let achievementsSummary: string
  if (memoryService) {
    const ctx = await memoryService.assembleContext(input.userId, {
      entityType: 'application',
      entityId: input.applicationId,
    })
    achievementsSummary =
      ctx.achievements.length > 0
        ? ctx.achievements
            .slice(0, 8)
            .map((a, i) => `${i + 1}. ${a.summary}`)
            .join('\n')
        : JSON.stringify((ctx.profile as Record<string, unknown>)?.masterResume ?? {}).slice(0, 1_000)
    toolsUsed.push('memory_service')
  } else {
    const [profile] = await db.select().from(schema.profiles).where(eq(schema.profiles.userId, input.userId))
    const achievements = await db.select().from(schema.achievements).where(eq(schema.achievements.userId, input.userId))
    achievementsSummary =
      achievements.length > 0
        ? achievements.slice(0, 8).map((a, i) => `${i + 1}. ${a.summary}`).join('\n')
        : JSON.stringify(profile?.masterResume ?? {}).slice(0, 1_000)
    toolsUsed.push('db_profile')
  }

  const briefText =
    Object.keys(briefContent).length > 0
      ? JSON.stringify(briefContent, null, 2).slice(0, 2_000)
      : 'No company brief available.'

  const missingSkills = match?.missingSkills ?? []

  const prompt = `You are an expert interview coach preparing a candidate for a job interview.

Role: ${opportunity.roleTitle}${opportunity.seniority ? ` (${opportunity.seniority})` : ''}
Required skills: ${(opportunity.requiredSkills ?? []).join(', ')}
Skill gaps to address: ${missingSkills.join(', ') || 'none identified'}

Company research:
${briefText}

Candidate achievements:
${achievementsSummary}

Generate a comprehensive interview brief with:
1. 3-5 key themes this company cares about (grounded in the research)
2. 6-8 likely interview questions (mix behavioral, technical, situational, culture fit)
3. 3-4 STAR story suggestions mapped to likely questions
4. 3-5 company-specific angles to demonstrate genuine interest
5. Any gaps or red flags to proactively address
6. A compelling 30-second opening pitch for "tell me about yourself"

Only reference facts from the materials above — do not invent company metrics.`

  let brief: z.infer<typeof InterviewBriefSchema>
  let modelKind: string
  let modelName: string

  try {
    const result = await generateStructured(prompt, InterviewBriefSchema, {
      taskType: 'interview_brief',
      containsPersonalData: true,
      allowCloud: true,
    })
    brief = result.data
    modelKind = result.modelKind
    modelName = result.modelName
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await markFailed(input.taskId, `Interview brief failed: ${msg}`)
    return { error: `Interview brief failed: ${msg}` }
  }

  // Upsert interview record
  const existing = await db
    .select()
    .from(schema.interviews)
    .where(eq(schema.interviews.applicationId, input.applicationId))
    .limit(1)

  let interviewId: string
  if (existing.length > 0) {
    await db
      .update(schema.interviews)
      .set({ brief: brief as unknown as Record<string, unknown> })
      .where(eq(schema.interviews.id, existing[0].id))
    interviewId = existing[0].id
  } else {
    const [interview] = await db
      .insert(schema.interviews)
      .values({
        userId: input.userId,
        applicationId: input.applicationId,
        brief: brief as unknown as Record<string, unknown>,
      })
      .returning()
    interviewId = interview.id
  }

  // Graph enrichment: REQUIRES edges for identified skill gaps
  if (graphService && missingSkills.length > 0) {
    try {
      await graphService.enrich(input.userId, {
        nodes: [
          { type: 'opportunity', entityId: opportunity.id, label: opportunity.roleTitle },
          ...missingSkills.map((s) => ({ type: 'skill', label: s })),
        ],
        edges: missingSkills.map((s) => ({
          fromNodeType: 'opportunity',
          fromEntityId: opportunity.id,
          fromLabel: opportunity.roleTitle,
          toNodeType: 'skill',
          toLabel: s,
          relationship: 'REQUIRES',
          evidence: [{ source: 'interview_brief_agent', applicationId: input.applicationId }],
        })),
      })
    } catch (err) {
      console.error('[interview] graph enrich error (non-blocking):', String(err))
    }
  }

  // Save to Qdrant interview_intelligence
  try {
    const gapSummary = `Interview brief for ${opportunity.roleTitle}. Skill gaps: ${missingSkills.join(', ') || 'none'}. Key themes: ${brief.key_themes.join(', ')}.`
    const vector = await embed(gapSummary)
    await qdrantUpsert('interview_intelligence', randomUUID(), vector, {
      userId: input.userId,
      entityType: 'interview',
      entityId: interviewId,
      content: gapSummary,
      channel: null,
      agentName: 'interview_brief',
      createdAt: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[interview] qdrant upsert error (non-blocking):', String(err))
  }

  // Save observation
  if (memoryService) {
    try {
      await memoryService.saveObservation(
        input.userId,
        'interview_brief',
        `Generated interview brief for ${opportunity.roleTitle}. ${brief.key_themes.length} themes, ${brief.likely_questions.length} questions. Gaps: ${missingSkills.join(', ') || 'none'}.`,
        'interview',
        interviewId,
      )
    } catch (err) {
      console.error('[interview] saveObservation error (non-blocking):', String(err))
    }
  }

  const output = { interviewId, questionsCount: brief.likely_questions.length }
  await markSucceeded(input.taskId, { output, modelKind, modelName, toolsUsed, costUsd: 0 })
  return { ...output, modelKind, modelName, toolsUsed, costUsd: 0 }
}

// ─────────────────────────────────────────────────────────────
// Mock Session Agent (unchanged — no profile data needed)
// ─────────────────────────────────────────────────────────────

export async function runMockSessionAgent(input: {
  taskId: string
  userId: string
  interviewId: string
  question: string
  sessionId?: string
}): Promise<Record<string, unknown>> {
  await markRunning(input.taskId)

  const [interview] = await db
    .select()
    .from(schema.interviews)
    .where(eq(schema.interviews.id, input.interviewId))

  if (!interview) {
    await markFailed(input.taskId, 'Interview not found')
    return { error: 'Interview not found' }
  }

  const brief = interview.brief as Record<string, unknown> | null

  const prompt = `You are an expert interview coach. Given this interview question, provide an ideal answer and coaching feedback.

Question: "${input.question}"

${
  brief
    ? `Interview context:
- Key themes: ${JSON.stringify(brief.key_themes)}
- Opening pitch: ${brief.opening_pitch}
`
    : ''
}

Provide:
1. An ideal answer using the STAR format where applicable (150-250 words, confident and specific)
2. A coaching tip on delivery or content (what makes or breaks this answer)
3. A likely follow-up question the interviewer might ask next`

  let answer: z.infer<typeof MockAnswerSchema>
  let modelKind: string
  let modelName: string

  try {
    const result = await generateStructured(prompt, MockAnswerSchema, {
      taskType: 'mock_session',
      containsPersonalData: false,
      allowCloud: true,
    })
    answer = result.data
    modelKind = result.modelKind
    modelName = result.modelName
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await markFailed(input.taskId, `Mock session failed: ${msg}`)
    return { error: `Mock session failed: ${msg}` }
  }

  const turn = {
    question: input.question,
    ideal_answer: answer.ideal_answer,
    coaching_tip: answer.coaching_tip,
    follow_up_question: answer.follow_up_question,
    timestamp: new Date().toISOString(),
  }

  if (input.sessionId) {
    const [session] = await db
      .select()
      .from(schema.mockSessions)
      .where(eq(schema.mockSessions.id, input.sessionId))

    if (session) {
      const transcript = (session.transcript as unknown[]) ?? []
      await db
        .update(schema.mockSessions)
        .set({ transcript: [...transcript, turn] as unknown as Record<string, unknown>[] })
        .where(eq(schema.mockSessions.id, input.sessionId))
    }
  } else {
    await db.insert(schema.mockSessions).values({
      interviewId: input.interviewId,
      transcript: [turn] as unknown as Record<string, unknown>[],
    })
  }

  const output = { interviewId: input.interviewId, answer }
  await markSucceeded(input.taskId, { output, modelKind, modelName, toolsUsed: ['db_interview'], costUsd: 0 })
  return { ...output, modelKind, modelName, toolsUsed: ['db_interview'], costUsd: 0 }
}
