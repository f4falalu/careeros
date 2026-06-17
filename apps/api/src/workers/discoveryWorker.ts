// Job board discovery worker.
// Runs on a 15-minute tick; polls each enabled job_board_sources row when due.
// fetch → normalize → dedupe (job_board_seen) → insert opportunity → enqueue match agent.

import { eq, and } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { enqueueAgent } from './queue.js'
import type { NormalizedJob, BoardFilters } from '../agents/lib/boards/index.js'
import { remotiveAdapter } from '../agents/lib/boards/remotive.js'
import { remoteOkAdapter } from '../agents/lib/boards/remoteok.js'
import { weworkRemotelyAdapter } from '../agents/lib/boards/weworkremotely.js'
import { isCoarselyRelevant } from '../lib/targeting.js'

const ADAPTERS = {
  remotive:        remotiveAdapter,
  remoteok:        remoteOkAdapter,
  weworkremotely:  weworkRemotelyAdapter,
}

// Derive a board query from a Target's intent. Boards filter what they can natively;
// the rest is gated on our side via isCoarselyRelevant.
function buildBoardFilters(target: schema.JobTarget): BoardFilters {
  const keywords = [...(target.roleTitles ?? []), ...(target.keywords ?? [])].filter(Boolean)
  const regions = (target.locations ?? []).filter(Boolean)
  return {
    keywords: keywords.length ? keywords : undefined,
    regions: regions.length ? regions : undefined,
    minSalary: target.minSalary ?? undefined,
  }
}

// ─────────────────────────────────────────────────────────────
// Core: poll one source
// ─────────────────────────────────────────────────────────────

export async function pollSource(
  source: schema.JobBoardSource,
): Promise<{ newJobs: number; errors: number }> {
  const adapter = ADAPTERS[source.board as keyof typeof ADAPTERS]
  if (!adapter) {
    console.warn(`[discovery] unknown board "${source.board}" — skipping`)
    return { newJobs: 0, errors: 0 }
  }

  // Targets drive ingestion: only pull board jobs relevant to an active Job Target.
  // No active targets → ingest nothing (the firehose is never stored unfiltered).
  const targets = await db
    .select()
    .from(schema.jobTargets)
    .where(and(eq(schema.jobTargets.userId, source.userId), eq(schema.jobTargets.status, 'active')))

  if (targets.length === 0) {
    await db
      .update(schema.jobBoardSources)
      .set({ lastPolledAt: new Date() })
      .where(eq(schema.jobBoardSources.id, source.id))
    console.log(`[discovery:${source.board}] no active targets — nothing ingested`)
    return { newJobs: 0, errors: 0 }
  }

  let newJobs = 0
  let errors = 0

  for (const target of targets) {
    let jobs: NormalizedJob[]
    try {
      jobs = await adapter.fetch(buildBoardFilters(target))
    } catch (err) {
      console.error(`[discovery:${source.board}] fetch error for target "${target.label}":`, err)
      errors++
      continue
    }

    for (const job of jobs) {
      // Coarse pre-filter: drop jobs that violate this target's locked conditions or
      // aren't intent-relevant. Fine tiering (incl. capability/adjacent) happens in match.
      if (!isCoarselyRelevant(target, job)) continue

      try {
        // Dedupe ledger — a job pulled by multiple targets is ingested once.
        const [seen] = await db
          .select({ id: schema.jobBoardSeen.id })
          .from(schema.jobBoardSeen)
          .where(
            and(
              eq(schema.jobBoardSeen.userId, source.userId),
              eq(schema.jobBoardSeen.board, source.board),
              eq(schema.jobBoardSeen.externalId, job.externalId),
            ),
          )
          .limit(1)

        if (seen) continue

        // Upsert company
        let companyId: string | null = null
        if (job.companyName && job.companyName !== 'Unknown') {
          const [existingCo] = await db
            .select({ id: schema.companies.id })
            .from(schema.companies)
            .where(
              and(
                eq(schema.companies.userId, source.userId),
                eq(schema.companies.name, job.companyName),
              ),
            )
            .limit(1)

          if (existingCo) {
            companyId = existingCo.id
          } else {
            const [newCo] = await db
              .insert(schema.companies)
              .values({ userId: source.userId, name: job.companyName })
              .onConflictDoNothing()
              .returning({ id: schema.companies.id })
            companyId = newCo?.id ?? null
          }
        }

        // Insert opportunity
        const [opp] = await db
          .insert(schema.opportunities)
          .values({
            userId: source.userId,
            companyId,
            roleTitle: job.roleTitle,
            location: job.location,
            workModel: job.workModel,
            salaryText: job.salaryText,
            requiredSkills: job.requiredSkills,
            description: job.description,
            sourceUrl: job.sourceUrl,
            applyUrl: job.applyUrl,
            sourceChannel: 'job_board',
          })
          .returning()

        // Record in dedupe ledger
        await db
          .insert(schema.jobBoardSeen)
          .values({
            userId: source.userId,
            board: source.board,
            externalId: job.externalId,
            opportunityId: opp.id,
          })
          .onConflictDoNothing()

        // Enqueue match agent (assigns target links + tiers across all active targets)
        const [task] = await db
          .insert(schema.agentTasks)
          .values({
            userId: source.userId,
            agentName: 'match',
            status: 'queued',
            sourceChannel: 'job_board',
            relatedType: 'opportunity',
            relatedId: opp.id,
            input: { opportunityId: opp.id },
          })
          .returning()

        await enqueueAgent('match', {
          taskId: task.id,
          userId: source.userId,
          opportunityId: opp.id,
        })

        newJobs++
      } catch (err) {
        console.error(`[discovery:${source.board}] insert error for "${job.roleTitle}":`, err)
        errors++
      }
    }
  }

  // Update lastPolledAt
  await db
    .update(schema.jobBoardSources)
    .set({ lastPolledAt: new Date() })
    .where(eq(schema.jobBoardSources.id, source.id))

  console.log(`[discovery:${source.board}] done — ${newJobs} new, ${errors} errors`)
  return { newJobs, errors }
}

// ─────────────────────────────────────────────────────────────
// Scheduler: poll all due sources
// ─────────────────────────────────────────────────────────────

async function pollDueSources(): Promise<void> {
  const now = Date.now()
  const sources = await db
    .select()
    .from(schema.jobBoardSources)
    .where(eq(schema.jobBoardSources.enabled, true))

  for (const source of sources) {
    const dueAt = source.lastPolledAt
      ? source.lastPolledAt.getTime() + source.pollIntervalMinutes * 60_000
      : 0

    if (now >= dueAt) {
      await pollSource(source).catch((err) =>
        console.error(`[discovery] uncaught error for source ${source.id}:`, err),
      )
    }
  }
}

export function startDiscoveryWorker(): void {
  const TICK_MS = 15 * 60 * 1000
  // Run immediately on startup, then every 15 minutes
  pollDueSources().catch(console.error)
  setInterval(() => pollDueSources().catch(console.error), TICK_MS)
  console.log('[discovery] worker started (tick every 15 min)')
}
