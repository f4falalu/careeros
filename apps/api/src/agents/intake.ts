// Intake Agent — extracts structured job data from a URL, pasted text, or file path.
// Triggers: new job URL/text arriving via chat or POST /opportunities/intake
// Writes: companies (upsert), opportunities (update), applications (create if missing)
// Fan-out: enqueues research + match agents after a successful extraction

import { z } from 'zod'
import { db, schema } from '../db/index.js'
import { eq } from 'drizzle-orm'
import { generateStructured } from '../router/modelRouter.js'
import { webFetch, cleanUrl } from './lib/tools.js'
import { markRunning, markSucceeded, markFailed } from './lib/task.js'
import type { MemoryService } from '../services/memory.js'
import type { GraphService } from '../services/graph.js'

// ─────────────────────────────────────────────────────────────
// Output schema
// ─────────────────────────────────────────────────────────────
const JobExtractionSchema = z.object({
  company_name: z.string(),
  company_domain: z.string().nullable().optional(),
  role_title: z.string(),
  seniority: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  work_model: z.enum(['remote', 'hybrid', 'onsite', 'unknown']).default('unknown'),
  salary_text: z.string().nullable().optional(),
  visa_signal: z.string().nullable().optional(),
  required_skills: z.array(z.string()).default([]),
  nice_to_haves: z.array(z.string()).default([]),
  description: z.string(),
  apply_url: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1),
})

type JobExtraction = z.infer<typeof JobExtractionSchema>

// ─────────────────────────────────────────────────────────────
// Agent entry point
// ─────────────────────────────────────────────────────────────
export async function runIntakeAgent(
  input: {
    taskId: string
    userId: string
    opportunityId: string
    url?: string
    text?: string
    filePath?: string
  },
  memoryService?: MemoryService,
  graphService?: GraphService,
): Promise<Record<string, unknown>> {
  await markRunning(input.taskId)

  if (memoryService) {
    try {
      await memoryService.assembleContext(input.userId)
    } catch (err) {
      console.error('[intake] assembleContext error (non-blocking):', String(err))
    }
  }

  let jobText = ''
  const toolsUsed: string[] = []

  // 1. Fetch job content from the appropriate source
  if (input.url) {
    const cleaned = cleanUrl(input.url)
    try {
      const { text, ok } = await webFetch(cleaned)
      if (ok) {
        jobText = text
        toolsUsed.push('web_fetch')
      }
    } catch (err) {
      // SSRF block or network error — fall through to markFailed below
    }
  } else if (input.text) {
    jobText = input.text
  } else if (input.filePath) {
    // PDF extraction is handled by a dedicated sidecar in Phase 2.
    // For Phase 1 we record the reference so the opportunity can be updated later.
    jobText = `PDF file: ${input.filePath}`
    toolsUsed.push('file_reference')
  }

  if (!jobText || jobText.length < 50) {
    await markFailed(input.taskId, 'Could not extract job content')
    return { error: 'Could not extract job content' }
  }

  // 2. Extract structured job data via LLM
  const prompt = `You extract structured job data from a posting. You NEVER invent fields. If a field is absent, return null — do not guess salary, visa, or seniority. Normalize skills to short canonical tokens (e.g. "PostgreSQL" not "experience with Postgres DBs").

Job posting content:
${jobText.slice(0, 8_000)}

Extract the structured job data. For confidence: 1.0 = all fields clear, 0.0 = mostly guessing.`

  let extraction: JobExtraction
  let modelKind: string
  let modelName: string

  try {
    const result = await generateStructured(prompt, JobExtractionSchema, {
      taskType: 'intake',
      containsPersonalData: false,
      allowCloud: false,
    })
    extraction = result.data
    modelKind = result.modelKind
    modelName = result.modelName
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await markFailed(input.taskId, `LLM extraction failed: ${msg}`)
    return { error: `LLM extraction failed: ${msg}` }
  }

  // 3. Upsert company (match by name or domain, scoped to this user)
  const existingCompanies = await db
    .select()
    .from(schema.companies)
    .where(eq(schema.companies.userId, input.userId))
    .limit(100)

  const found = existingCompanies.find(
    (c) =>
      c.name.toLowerCase() === extraction.company_name.toLowerCase() ||
      (extraction.company_domain && c.domain === extraction.company_domain),
  )

  let companyId: string
  if (found) {
    companyId = found.id
  } else {
    const [company] = await db
      .insert(schema.companies)
      .values({
        userId: input.userId,
        name: extraction.company_name,
        domain: extraction.company_domain ?? null,
      })
      .returning()
    companyId = company.id
  }

  // 4. Update opportunity with extracted data
  await db
    .update(schema.opportunities)
    .set({
      companyId,
      roleTitle: extraction.role_title,
      seniority: extraction.seniority ?? null,
      location: extraction.location ?? null,
      workModel: extraction.work_model,
      salaryText: extraction.salary_text ?? null,
      visaSignal: extraction.visa_signal ?? null,
      requiredSkills: extraction.required_skills,
      niceToHaves: extraction.nice_to_haves,
      description: extraction.description,
      applyUrl: extraction.apply_url ? cleanUrl(extraction.apply_url) : null,
    })
    .where(eq(schema.opportunities.id, input.opportunityId))

  // 5. Create application record (default stage: 'saved') if one doesn't exist yet
  const existing = await db
    .select()
    .from(schema.applications)
    .where(eq(schema.applications.opportunityId, input.opportunityId))
    .limit(1)

  if (existing.length === 0) {
    await db.insert(schema.applications).values({
      userId: input.userId,
      opportunityId: input.opportunityId,
      stage: 'saved',
    })
  }

  // 6. Fan-out: enqueue research + match agents
  const { enqueueAgent } = await import('../workers/queue.js')

  const [researchTask] = await db
    .insert(schema.agentTasks)
    .values({
      userId: input.userId,
      agentName: 'research',
      status: 'queued',
      sourceChannel: 'web',
      relatedType: 'company',
      relatedId: companyId,
      input: { companyId },
    })
    .returning()
  await enqueueAgent('research', { taskId: researchTask.id, userId: input.userId, companyId })

  const [matchTask] = await db
    .insert(schema.agentTasks)
    .values({
      userId: input.userId,
      agentName: 'match',
      status: 'queued',
      sourceChannel: 'web',
      relatedType: 'opportunity',
      relatedId: input.opportunityId,
      input: { opportunityId: input.opportunityId },
    })
    .returning()
  await enqueueAgent('match', {
    taskId: matchTask.id,
    userId: input.userId,
    opportunityId: input.opportunityId,
  })

  const output = {
    extraction,
    companyId,
    lowConfidence: extraction.confidence < 0.5,
  }

  // 7. Graph enrichment: Opportunity node, Company node, REQUIRES edges for each required skill
  if (graphService) {
    try {
      const skillNodes = extraction.required_skills.map((s) => ({ type: 'skill' as const, label: s }))
      await graphService.enrich(input.userId, {
        nodes: [
          { type: 'opportunity', entityId: input.opportunityId, label: extraction.role_title },
          { type: 'company', entityId: companyId, label: extraction.company_name },
          ...skillNodes,
        ],
        edges: [
          ...extraction.required_skills.map((s) => ({
            fromNodeType: 'opportunity',
            fromEntityId: input.opportunityId,
            fromLabel: extraction.role_title,
            toNodeType: 'skill',
            toLabel: s,
            relationship: 'REQUIRES',
            evidence: [{ source: 'intake_agent', confidence: extraction.confidence }],
          })),
        ],
      })
    } catch (err) {
      console.error('[intake] graph enrich error (non-blocking):', String(err))
    }
  }

  // 8. Save observation
  if (memoryService) {
    try {
      await memoryService.saveObservation(
        input.userId,
        'intake',
        `Parsed job "${extraction.role_title}" at ${extraction.company_name}. ${extraction.required_skills.length} required skills extracted. Confidence: ${Math.round(extraction.confidence * 100)}%.`,
        'opportunity',
        input.opportunityId,
      )
    } catch (err) {
      console.error('[intake] saveObservation error (non-blocking):', String(err))
    }
  }

  await markSucceeded(input.taskId, {
    output,
    modelKind,
    modelName,
    toolsUsed,
    costUsd: 0,
  })

  return { ...output, modelKind, modelName, toolsUsed, costUsd: 0 }
}
