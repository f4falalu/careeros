// Research Agent — produces a sourced company brief using SearXNG/Tavily + web_fetch.
// Trigger: auto-enqueued after Intake, or explicit POST /companies/:id/brief
// Guardrail: factual sections must have at least one supporting source — result is rejected otherwise.
// Writes: company_briefs row

import { z } from 'zod'
import { db, schema } from '../db/index.js'
import { eq } from 'drizzle-orm'
import { generateStructured } from '../router/modelRouter.js'
import { search, webFetch } from './lib/tools.js'
import { markRunning, markSucceeded, markFailed } from './lib/task.js'
import type { MemoryService } from '../services/memory.js'
import type { GraphService } from '../services/graph.js'

// ─────────────────────────────────────────────────────────────
// Output schema
// ─────────────────────────────────────────────────────────────
const CompanyBriefSchema = z.object({
  business_model: z.string().nullable().optional(),
  products: z.array(z.string()).default([]),
  funding: z.string().nullable().optional(),
  competitors: z.array(z.string()).default([]),
  leadership: z.array(z.string()).default([]),
  recent_news: z.array(z.string()).default([]),
  culture_signals: z.array(z.string()).default([]),
  hiring_signals: z.array(z.string()).default([]),
})

type CompanyBrief = z.infer<typeof CompanyBriefSchema>

// ─────────────────────────────────────────────────────────────
// Agent entry point
// ─────────────────────────────────────────────────────────────
export async function runResearchAgent(
  input: {
    taskId: string
    userId: string
    companyId: string
  },
  memoryService?: MemoryService,
  graphService?: GraphService,
): Promise<Record<string, unknown>> {
  await markRunning(input.taskId)

  if (memoryService) {
    try {
      await memoryService.assembleContext(input.userId)
    } catch (err) {
      console.error('[research] assembleContext error (non-blocking):', String(err))
    }
  }

  const [company] = await db
    .select()
    .from(schema.companies)
    .where(eq(schema.companies.id, input.companyId))

  if (!company) {
    await markFailed(input.taskId, 'Company not found')
    return { error: 'Company not found' }
  }

  // 1. Run three focused searches to gather diverse signals
  const queries = [
    `${company.name} company overview business model`,
    `${company.name} funding news 2025`,
    `${company.name} culture glassdoor hiring`,
  ]

  const searchResults = await Promise.all(queries.map((q) => search(q)))
  const allResults = searchResults.flat()

  const sources: Array<{ title: string; url: string; fetched_at: string }> = []
  const snippets: string[] = []

  // 2. Fetch full text from the top results
  for (const result of allResults.slice(0, 5)) {
    try {
      const { text, ok } = await webFetch(result.url)
      if (ok && text.length > 100) {
        snippets.push(`Source: ${result.title}\n${text.slice(0, 1_500)}`)
        sources.push({
          title: result.title,
          url: result.url,
          fetched_at: new Date().toISOString(),
        })
      }
    } catch {
      // Skip results that fail SSRF check or network errors
    }
  }

  // 3. Fall back to search snippets when full fetch yields nothing
  if (snippets.length === 0) {
    for (const r of allResults.slice(0, 3)) {
      snippets.push(`${r.title}: ${r.snippet}`)
      sources.push({ title: r.title, url: r.url, fetched_at: new Date().toISOString() })
    }
  }

  if (snippets.length === 0) {
    await markFailed(input.taskId, 'No search results found')
    return { error: 'No search results found' }
  }

  // 4. Synthesise a company brief from the fetched sources
  const prompt = `You research a company for a job seeker. Use ONLY the provided sources — do NOT state facts from memory. Every populated field must trace to the sources below. If you cannot verify a section, return it as null/empty.

Company: ${company.name}${company.domain ? ` (${company.domain})` : ''}

Sources:
${snippets.join('\n\n---\n\n').slice(0, 10_000)}

Extract a concise company brief. Prefer information from the last 12 months.`

  let brief: CompanyBrief
  let modelKind: string
  let modelName: string

  try {
    const result = await generateStructured(prompt, CompanyBriefSchema, {
      taskType: 'research',
      containsPersonalData: false,
      allowCloud: false,
    })
    brief = result.data
    modelKind = result.modelKind
    modelName = result.modelName
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await markFailed(input.taskId, `LLM synthesis failed: ${msg}`)
    return { error: `LLM synthesis failed: ${msg}` }
  }

  // 5. Guardrail: populated factual sections must have at least one source
  const hasPopulatedFacts =
    brief.business_model ||
    brief.funding ||
    brief.leadership.length > 0 ||
    brief.products.length > 0

  if (hasPopulatedFacts && sources.length === 0) {
    await markFailed(input.taskId, 'Research produced facts without sources — rejected')
    return { error: 'Research guardrail: no sources for factual claims' }
  }

  // 6. Persist the brief
  const [savedBrief] = await db
    .insert(schema.companyBriefs)
    .values({
      companyId: input.companyId,
      content: brief as Record<string, unknown>,
      sources: sources as unknown as Record<string, unknown>[],
    })
    .returning()

  const output = {
    briefId: savedBrief.id,
    companyName: company.name,
    sourcesCount: sources.length,
  }

  // Graph enrichment: create Company node
  if (graphService) {
    try {
      await graphService.enrich(input.userId, {
        nodes: [{ type: 'company', entityId: input.companyId, label: company.name }],
        edges: [],
      })
    } catch (err) {
      console.error('[research] graph enrich error (non-blocking):', String(err))
    }
  }

  if (memoryService) {
    try {
      await memoryService.saveObservation(
        input.userId,
        'research',
        `Researched ${company.name}: found ${sources.length} sources. Business model: ${brief.business_model ?? 'unknown'}. Funding: ${brief.funding ?? 'unknown'}.`,
        'company',
        input.companyId,
      )
    } catch (err) {
      console.error('[research] saveObservation error (non-blocking):', String(err))
    }
  }

  await markSucceeded(input.taskId, {
    output,
    modelKind,
    modelName,
    toolsUsed: ['search', 'web_fetch'],
    costUsd: 0,
  })

  return { ...output, modelKind, modelName, toolsUsed: ['search', 'web_fetch'], costUsd: 0 }
}
