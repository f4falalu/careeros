// VVP Agent — Value Validation Project: two-step flow.
// Step 1 (propose): given company brief + role → propose 2-3 angles.
// Step 2 (generate): given a vvpId + chosen angle → produce the full artifact.
// Writes: vvps row; graph DEMONSTRATES edges for skills demonstrated; Qdrant vvp_context

import { z } from 'zod'
import { db, schema } from '../db/index.js'
import { eq } from 'drizzle-orm'
import { generateStructured, embed } from '../router/modelRouter.js'
import { search, webFetch } from './lib/tools.js'
import { markRunning, markSucceeded, markFailed } from './lib/task.js'
import { qdrantUpsert } from '../lib/qdrant.js'
import { randomUUID } from 'crypto'
import type { MemoryService } from '../services/memory.js'
import type { GraphService } from '../services/graph.js'

// ─────────────────────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────────────────────

const VvpAngleSchema = z.object({
  kind: z.enum(['audit', 'growth_strategy', 'automation', 'market_analysis', 'product_improvement', 'analytics_dashboard', 'other']),
  title: z.string(),
  premise: z.string(),
  why_it_lands: z.string(),
})

const VvpProposalSchema = z.object({
  angles: z.array(VvpAngleSchema).min(2).max(3),
})

const VvpArtifactSchema = z.object({
  title: z.string(),
  executive_summary: z.string(),
  sections: z.array(z.object({ heading: z.string(), body: z.string() })),
  key_recommendations: z.array(z.string()),
  next_steps: z.array(z.string()),
  skills_demonstrated: z.array(z.string()).optional(),
})

// ─────────────────────────────────────────────────────────────
// Step 1 — Propose angles
// ─────────────────────────────────────────────────────────────

export async function runVvpProposeAgent(
  input: {
    taskId: string
    userId: string
    opportunityId: string
  },
  memoryService?: MemoryService,
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

  // 1. Load company brief
  let briefContent: Record<string, unknown> = {}
  let briefSources: Array<{ title: string; url: string }> = []

  if (opportunity.companyId) {
    const [brief] = await db
      .select()
      .from(schema.companyBriefs)
      .where(eq(schema.companyBriefs.companyId, opportunity.companyId))

    if (brief) {
      briefContent = brief.content as Record<string, unknown>
      briefSources = (brief.sources as Array<{ title: string; url: string }>) ?? []
    }
  }

  // 2. Supplement with a fresh search if brief is missing or thin
  const toolsUsed: string[] = ['db_brief']
  const supplementSnippets: string[] = []

  if (Object.keys(briefContent).length === 0 && opportunity.companyId) {
    const [company] = await db
      .select()
      .from(schema.companies)
      .where(eq(schema.companies.id, opportunity.companyId))

    if (company) {
      const results = await search(`${company.name} ${opportunity.roleTitle} challenges opportunities`)
      toolsUsed.push('search')

      for (const r of results.slice(0, 3)) {
        try {
          const { text, ok } = await webFetch(r.url)
          if (ok && text.length > 100) {
            supplementSnippets.push(`${r.title}: ${text.slice(0, 800)}`)
            briefSources.push({ title: r.title, url: r.url })
            toolsUsed.push('web_fetch')
          }
        } catch {
          supplementSnippets.push(`${r.title}: ${r.snippet}`)
        }
      }
    }
  }

  const briefText =
    Object.keys(briefContent).length > 0
      ? JSON.stringify(briefContent, null, 2).slice(0, 3_000)
      : supplementSnippets.join('\n\n').slice(0, 3_000) || 'No company research available.'

  // 3. Propose angles
  const prompt = `You are a career strategist. Propose 2-3 Value Validation Project angles that demonstrate this candidate could do THIS job at THIS company.

Role: ${opportunity.roleTitle}${opportunity.seniority ? ` (${opportunity.seniority})` : ''}
Required skills: ${(opportunity.requiredSkills ?? []).join(', ')}

Company research:
${briefText}

Rules:
- Every angle premise must cite a REAL fact from the company research above — no invented facts.
- Angles must map to the role's actual responsibilities.
- Vary the kind (audit, growth_strategy, analytics_dashboard, etc.).
- Be specific to THIS company and role, not generic.

Propose 2-3 concrete VVP angles.`

  let proposal: z.infer<typeof VvpProposalSchema>
  let modelKind: string
  let modelName: string

  try {
    const result = await generateStructured(prompt, VvpProposalSchema, {
      taskType: 'vvp_propose',
      containsPersonalData: false,
      allowCloud: true,
    })
    proposal = result.data
    modelKind = result.modelKind
    modelName = result.modelName
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await markFailed(input.taskId, `VVP proposal failed: ${msg}`)
    return { error: `VVP proposal failed: ${msg}` }
  }

  // 4. Persist as a VVP row in proposal phase
  const firstAngle = proposal.angles[0]
  const [saved] = await db
    .insert(schema.vvps)
    .values({
      userId: input.userId,
      opportunityId: input.opportunityId,
      companyId: opportunity.companyId ?? undefined,
      kind: firstAngle.kind,
      format: 'report',
      title: `VVP Proposals — ${opportunity.roleTitle}`,
      content: { phase: 'proposal', proposals: proposal.angles } as unknown as Record<string, unknown>,
      sources: briefSources as unknown as Record<string, unknown>[],
    })
    .returning()

  // Save observation
  if (memoryService) {
    try {
      await memoryService.saveObservation(
        input.userId,
        'vvp_propose',
        `Proposed ${proposal.angles.length} VVP angles for ${opportunity.roleTitle}: ${proposal.angles.map((a) => a.title).join(', ')}.`,
        'vvp',
        saved.id,
      )
    } catch (err) {
      console.error('[vvp_propose] saveObservation error (non-blocking):', String(err))
    }
  }

  const output = { vvpId: saved.id, phase: 'proposal', proposals: proposal.angles, sourcesCount: briefSources.length }
  await markSucceeded(input.taskId, { output, modelKind, modelName, toolsUsed, costUsd: 0 })
  return { ...output, modelKind, modelName, toolsUsed, costUsd: 0 }
}

// ─────────────────────────────────────────────────────────────
// Step 2 — Generate artifact from a selected angle
// ─────────────────────────────────────────────────────────────

export async function runVvpGenerateAgent(
  input: {
    taskId: string
    userId: string
    vvpId: string
    angleIndex: number
  },
  memoryService?: MemoryService,
  graphService?: GraphService,
): Promise<Record<string, unknown>> {
  await markRunning(input.taskId)

  const [vvp] = await db
    .select()
    .from(schema.vvps)
    .where(eq(schema.vvps.id, input.vvpId))

  if (!vvp) {
    await markFailed(input.taskId, 'VVP record not found')
    return { error: 'VVP record not found' }
  }

  const content = vvp.content as { phase: string; proposals: z.infer<typeof VvpAngleSchema>[] }

  if (content.phase !== 'proposal' || !content.proposals) {
    await markFailed(input.taskId, 'VVP is not in proposal phase')
    return { error: 'VVP is not in proposal phase' }
  }

  const angle = content.proposals[input.angleIndex]
  if (!angle) {
    await markFailed(input.taskId, `No angle at index ${input.angleIndex}`)
    return { error: `No angle at index ${input.angleIndex}` }
  }

  // Load context
  let opportunityContext = ''
  let opportunityId: string | null = vvp.opportunityId ?? null
  if (vvp.opportunityId) {
    const [opp] = await db
      .select()
      .from(schema.opportunities)
      .where(eq(schema.opportunities.id, vvp.opportunityId))
    if (opp) {
      opportunityContext = `Role: ${opp.roleTitle}\nRequired skills: ${(opp.requiredSkills ?? []).join(', ')}`
    }
  }

  // Load profile via MemoryService if available
  let profileContext: string
  if (memoryService) {
    const ctx = await memoryService.assembleContext(input.userId)
    profileContext =
      ctx.achievements.length > 0
        ? ctx.achievements.slice(0, 5).map((a) => a.summary).join('\n')
        : JSON.stringify((ctx.profile as Record<string, unknown>)?.masterResume ?? {}).slice(0, 1_000)
  } else {
    const [profile] = await db.select().from(schema.profiles).where(eq(schema.profiles.userId, input.userId))
    const achievements = await db.select().from(schema.achievements).where(eq(schema.achievements.userId, input.userId))
    profileContext =
      achievements.length > 0
        ? achievements.slice(0, 5).map((a) => a.summary).join('\n')
        : JSON.stringify(profile?.masterResume ?? {}).slice(0, 1_000)
  }

  // Load brief sources
  let briefSources: string[] = []
  if (vvp.companyId) {
    const [brief] = await db
      .select()
      .from(schema.companyBriefs)
      .where(eq(schema.companyBriefs.companyId, vvp.companyId))
    if (brief) {
      const bc = brief.content as Record<string, unknown>
      briefSources = [
        bc.business_model ? `Business model: ${bc.business_model}` : null,
        bc.funding ? `Funding: ${bc.funding}` : null,
        Array.isArray(bc.products) && bc.products.length > 0 ? `Products: ${(bc.products as string[]).join(', ')}` : null,
        Array.isArray(bc.recent_news) && bc.recent_news.length > 0
          ? `Recent news: ${(bc.recent_news as string[]).slice(0, 3).join('. ')}`
          : null,
      ].filter(Boolean) as string[]
    }
  }

  const prompt = `You are writing a Value Validation Project document for a job candidate.

Selected angle:
- Kind: ${angle.kind}
- Title: ${angle.title}
- Premise: ${angle.premise}
- Why it lands: ${angle.why_it_lands}

${opportunityContext}

Company context:
${briefSources.length > 0 ? briefSources.join('\n') : 'See angle premise above.'}

Candidate background (real facts only):
${profileContext}

Write a complete, compelling VVP document (500-800 words) that:
1. Opens with the problem/opportunity grounded in real company facts
2. Proposes a concrete deliverable the candidate would build
3. Shows the methodology (drawing on the candidate's real skills)
4. Quantifies the expected impact where possible
5. Closes with concrete next steps

Also include a "skills_demonstrated" array listing the core skills this VVP showcases.

Do NOT invent company metrics or candidate credentials not provided above.`

  let artifact: z.infer<typeof VvpArtifactSchema>
  let modelKind: string
  let modelName: string

  try {
    const result = await generateStructured(prompt, VvpArtifactSchema, {
      taskType: 'vvp_generate',
      containsPersonalData: true,
      allowCloud: true,
    })
    artifact = result.data
    modelKind = result.modelKind
    modelName = result.modelName
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await markFailed(input.taskId, `VVP generation failed: ${msg}`)
    return { error: `VVP generation failed: ${msg}` }
  }

  // Update the VVP row
  await db
    .update(schema.vvps)
    .set({
      kind: angle.kind,
      title: artifact.title,
      content: { phase: 'artifact', angle, artifact } as unknown as Record<string, unknown>,
    })
    .where(eq(schema.vvps.id, input.vvpId))

  // Graph enrichment: DEMONSTRATES edges for skills this VVP shows
  if (graphService && artifact.skills_demonstrated && artifact.skills_demonstrated.length > 0) {
    try {
      await graphService.enrich(input.userId, {
        nodes: [
          { type: 'vvp', entityId: input.vvpId, label: artifact.title },
          ...artifact.skills_demonstrated.map((s) => ({ type: 'skill', label: s })),
        ],
        edges: artifact.skills_demonstrated.map((s) => ({
          fromNodeType: 'vvp',
          fromEntityId: input.vvpId,
          fromLabel: artifact.title,
          toNodeType: 'skill',
          toLabel: s,
          relationship: 'DEMONSTRATES',
          evidence: [{ source: 'vvp_generate_agent', opportunityId, angleKind: angle.kind }],
        })),
      })
    } catch (err) {
      console.error('[vvp_generate] graph enrich error (non-blocking):', String(err))
    }
  }

  // Save to Qdrant vvp_context
  try {
    const vvpText = `VVP: ${artifact.title}. ${artifact.executive_summary.slice(0, 300)}`
    const vector = await embed(vvpText)
    await qdrantUpsert('vvp_context', randomUUID(), vector, {
      userId: input.userId,
      entityType: 'vvp',
      entityId: input.vvpId,
      content: vvpText,
      channel: null,
      agentName: 'vvp_generate',
      createdAt: new Date().toISOString(),
      kind: angle.kind,
    })
  } catch (err) {
    console.error('[vvp_generate] qdrant upsert error (non-blocking):', String(err))
  }

  // Save observation
  if (memoryService) {
    try {
      await memoryService.saveObservation(
        input.userId,
        'vvp_generate',
        `Generated VVP "${artifact.title}" (${angle.kind}). Skills demonstrated: ${(artifact.skills_demonstrated ?? []).join(', ')}.`,
        'vvp',
        input.vvpId,
      )
    } catch (err) {
      console.error('[vvp_generate] saveObservation error (non-blocking):', String(err))
    }
  }

  const output = { vvpId: vvp.id, phase: 'artifact', title: artifact.title, kind: angle.kind }
  await markSucceeded(input.taskId, { output, modelKind, modelName, toolsUsed: ['db_brief', 'memory_service', 'graph_enrich'], costUsd: 0 })
  return { ...output, modelKind, modelName, toolsUsed: ['db_brief', 'memory_service'], costUsd: 0 }
}
