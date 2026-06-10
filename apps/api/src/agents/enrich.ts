// CRM Enrichment Agent — Phase 4 (the compliant, low-risk autonomy track).
//
// Enriches an existing contact from PUBLIC web search only (no scraping, no
// login-gated sources). Fills in missing fields — never overwrites data the
// owner already entered, and never fabricates an email/profile it can't ground
// in a search result. Gated by autonomy.crmEnrichment.enabled (default on).

import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { generateStructured } from '../router/modelRouter.js'
import { search } from './lib/tools.js'
import { markRunning, markSucceeded, markFailed } from './lib/task.js'
import { getAutonomy } from './lib/autonomy.js'

const EnrichmentSchema = z.object({
  title: z.string().nullable().optional(),
  seniority: z.string().nullable().optional(),
  linkedin_url: z.string().nullable().optional(),
  // Only set when an address actually appears in the provided sources.
  email: z.string().nullable().optional(),
  summary: z.string().max(600).nullable().optional(),
  confidence: z.number().min(0).max(1),
})

type Enrichment = z.infer<typeof EnrichmentSchema>

export async function runEnrichAgent(input: {
  taskId: string
  userId: string
  contactId: string
}): Promise<Record<string, unknown>> {
  await markRunning(input.taskId)

  const autonomy = await getAutonomy(input.userId)
  if (!autonomy.crmEnrichment.enabled) {
    await markFailed(
      input.taskId,
      'Contact enrichment is turned off. Enable it in Settings → Autonomy.',
    )
    return { blocked: 'enrichment_disabled' }
  }

  const [contact] = await db
    .select()
    .from(schema.contacts)
    .where(and(eq(schema.contacts.id, input.contactId), eq(schema.contacts.userId, input.userId)))
    .limit(1)

  if (!contact) {
    await markFailed(input.taskId, 'Contact not found')
    return { error: 'Contact not found' }
  }

  // Company name for a more precise query.
  let companyName = ''
  if (contact.companyId) {
    const [co] = await db
      .select({ name: schema.companies.name })
      .from(schema.companies)
      .where(eq(schema.companies.id, contact.companyId))
      .limit(1)
    companyName = co?.name ?? ''
  }

  const query = [contact.name, contact.title, companyName, 'LinkedIn']
    .filter(Boolean)
    .join(' ')

  const results = await search(query)
  if (results.length === 0) {
    await markSucceeded(input.taskId, {
      output: { enriched: false, reason: 'no_search_results', query },
      toolsUsed: ['search'],
      costUsd: 0,
    })
    return { enriched: false, reason: 'no_search_results' }
  }

  const sourcesText = results
    .map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.snippet}`)
    .join('\n\n')

  const prompt = `You enrich a professional contact record from PUBLIC search results only. Never invent data. If a field is not clearly supported by the sources below, return null. Only return an email if an actual address appears in the sources — never guess one.

Contact: ${contact.name}${contact.title ? ` (${contact.title})` : ''}${companyName ? ` at ${companyName}` : ''}

Search results:
${sourcesText.slice(0, 6_000)}

Return the enrichment. confidence: 1.0 = clearly the right person, 0.0 = unsure.`

  let data: Enrichment
  let modelKind: string
  let modelName: string
  try {
    const result = await generateStructured(prompt, EnrichmentSchema, {
      taskType: 'enrich',
      containsPersonalData: true,
      allowCloud: false,
    })
    data = result.data
    modelKind = result.modelKind
    modelName = result.modelName
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await markFailed(input.taskId, `Enrichment failed: ${msg}`)
    return { error: `Enrichment failed: ${msg}` }
  }

  // Low confidence → don't touch the record; surface for manual review.
  if (data.confidence < 0.4) {
    await markSucceeded(input.taskId, {
      output: { enriched: false, reason: 'low_confidence', suggestion: data, query },
      modelKind,
      modelName,
      toolsUsed: ['search'],
      costUsd: 0,
    })
    return { enriched: false, reason: 'low_confidence' }
  }

  // Fill only missing fields — never overwrite owner-entered data.
  const updates: Partial<typeof schema.contacts.$inferInsert> = {}
  if (!contact.title && data.title) updates.title = data.title
  if (!contact.linkedinUrl && data.linkedin_url) updates.linkedinUrl = data.linkedin_url
  if (!contact.email && data.email) updates.email = data.email

  const filledFields = Object.keys(updates)
  if (filledFields.length > 0) {
    await db.update(schema.contacts).set(updates).where(eq(schema.contacts.id, contact.id))
  }

  const output = {
    enriched: filledFields.length > 0,
    filledFields,
    suggestion: data,
    sources: results.map((r) => ({ title: r.title, url: r.url })),
  }

  await markSucceeded(input.taskId, {
    output,
    modelKind,
    modelName,
    toolsUsed: ['search'],
    costUsd: 0,
  })

  return { ...output, modelKind, modelName }
}
