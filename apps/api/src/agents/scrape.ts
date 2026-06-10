// Scrape Agent — Phase 4 (autonomy, GATED + risky).
//
// Extracts job listings from an arbitrary careers page the owner points it at.
// This is the ToS-sensitive discovery track (vs. the compliant feeds in Phase 2.5),
// so it is fenced hard:
//   1. Master switch  (autonomy.scraping.enabled) must be on.
//   2. Domain opt-in  (autonomy.scraping.allowedDomains) must list the target host.
//   3. webFetch enforces the SSRF guard on the URL.
// Listings are de-duplicated via the existing job_board_seen ledger (board='scrape')
// and matched automatically, exactly like compliant-feed discoveries.

import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { generateStructured } from '../router/modelRouter.js'
import { webFetch, cleanUrl } from './lib/tools.js'
import { enqueueAgent } from '../workers/queue.js'
import { markRunning, markSucceeded, markFailed } from './lib/task.js'
import { getAutonomy, hostAllowed } from './lib/autonomy.js'

const ScrapeSchema = z.object({
  jobs: z
    .array(
      z.object({
        role_title: z.string(),
        location: z.string().nullable().optional(),
        work_model: z.enum(['remote', 'hybrid', 'onsite', 'unknown']).default('unknown'),
        apply_url: z.string().nullable().optional(),
      }),
    )
    .default([]),
})

export async function runScrapeAgent(input: {
  taskId: string
  userId: string
  url: string
}): Promise<Record<string, unknown>> {
  await markRunning(input.taskId)

  const autonomy = await getAutonomy(input.userId)
  if (!autonomy.scraping.enabled) {
    await markFailed(
      input.taskId,
      'Scraping is turned off. Enable it in Settings → Autonomy to use this.',
    )
    return { blocked: 'scraping_disabled' }
  }

  if (!hostAllowed(input.url, autonomy.scraping.allowedDomains)) {
    await markFailed(
      input.taskId,
      `That domain is not in your allowed scrape domains. Add it in Settings → Autonomy.`,
    )
    return { blocked: 'domain_not_allowed', url: input.url }
  }

  const cleaned = cleanUrl(input.url)
  let pageText = ''
  try {
    const { text, ok } = await webFetch(cleaned)
    if (ok) pageText = text
  } catch (err) {
    await markFailed(input.taskId, `Fetch blocked or failed: ${err instanceof Error ? err.message : String(err)}`)
    return { error: 'fetch_failed' }
  }

  if (!pageText || pageText.length < 100) {
    await markFailed(input.taskId, 'Could not extract content from that page')
    return { error: 'no_content' }
  }

  const host = new URL(cleaned).hostname

  const prompt = `You extract a list of job openings from a company careers page. Only include real openings present in the content. Never invent roles. If an opening has its own apply/detail link, include it as apply_url (absolute URL).

Careers page (${host}):
${pageText.slice(0, 8_000)}

Return the list of jobs.`

  type ScrapedJob = {
    role_title: string
    location?: string | null
    work_model: 'remote' | 'hybrid' | 'onsite' | 'unknown'
    apply_url?: string | null
  }
  let jobs: ScrapedJob[]
  let modelKind: string
  let modelName: string
  try {
    const result = await generateStructured(prompt, ScrapeSchema, {
      taskType: 'scrape',
      containsPersonalData: false,
      allowCloud: false,
    })
    jobs = (result.data.jobs ?? []).slice(0, 25).map((j) => ({
      role_title: j.role_title,
      location: j.location,
      work_model: j.work_model ?? 'unknown',
      apply_url: j.apply_url,
    }))
    modelKind = result.modelKind
    modelName = result.modelName
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await markFailed(input.taskId, `Extraction failed: ${msg}`)
    return { error: `Extraction failed: ${msg}` }
  }

  let inserted = 0
  for (const job of jobs) {
    const sourceUrl = job.apply_url ? cleanUrl(job.apply_url) : cleaned
    // External id for dedupe: the apply/source URL, else role+location on this host.
    const externalId = job.apply_url ? cleanUrl(job.apply_url) : `${host}:${job.role_title}:${job.location ?? ''}`

    const [seen] = await db
      .select({ id: schema.jobBoardSeen.id })
      .from(schema.jobBoardSeen)
      .where(
        and(
          eq(schema.jobBoardSeen.userId, input.userId),
          eq(schema.jobBoardSeen.board, 'scrape'),
          eq(schema.jobBoardSeen.externalId, externalId),
        ),
      )
      .limit(1)
    if (seen) continue

    const [opp] = await db
      .insert(schema.opportunities)
      .values({
        userId: input.userId,
        roleTitle: job.role_title,
        location: job.location ?? null,
        workModel: job.work_model,
        sourceUrl,
        applyUrl: job.apply_url ? cleanUrl(job.apply_url) : null,
        sourceChannel: 'job_board',
      })
      .returning()

    await db
      .insert(schema.jobBoardSeen)
      .values({ userId: input.userId, board: 'scrape', externalId, opportunityId: opp.id })
      .onConflictDoNothing()

    const [task] = await db
      .insert(schema.agentTasks)
      .values({
        userId: input.userId,
        agentName: 'match',
        status: 'queued',
        sourceChannel: 'job_board',
        relatedType: 'opportunity',
        relatedId: opp.id,
        input: { opportunityId: opp.id },
      })
      .returning()
    await enqueueAgent('match', { taskId: task.id, userId: input.userId, opportunityId: opp.id })

    inserted++
  }

  const output = { url: cleaned, host, found: jobs.length, inserted }

  await markSucceeded(input.taskId, {
    output,
    modelKind,
    modelName,
    toolsUsed: ['web_fetch', 'search'],
    costUsd: 0,
  })

  return { ...output, modelKind, modelName }
}
