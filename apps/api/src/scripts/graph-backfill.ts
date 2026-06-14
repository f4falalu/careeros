/**
 * graph-backfill.ts — idempotent script that seeds the Living Career Graph
 * from existing Postgres data (profiles, skills, work experiences, opportunities).
 *
 * Run with: npx tsx src/scripts/graph-backfill.ts
 */

import { db } from '../db/index.js'
import { schema } from '../db/index.js'
import { graphService } from '../services/index.js'

async function backfill() {
  const users = await db.select({ id: schema.users.id }).from(schema.users)
  console.log(`[backfill] Found ${users.length} users`)

  for (const user of users) {
    const userId = user.id
    console.log(`[backfill] Processing user ${userId}`)

    // 1. Load skills, work experiences, and opportunities
    const { eq } = await import('drizzle-orm')
    const skillRows = await db.select().from(schema.skills).where(eq(schema.skills.userId, userId))
    const workRows = await db.select().from(schema.workExperiences).where(eq(schema.workExperiences.userId, userId))
    const oppRows = await db.select().from(schema.opportunities).where(eq(schema.opportunities.userId, userId))

    // 2. Create user node + HAS_SKILL edges
    if (skillRows.length > 0) {
      await graphService.enrich(userId, {
        nodes: [
          { type: 'user', entityId: userId, label: 'User' },
          ...skillRows.map((s) => ({ type: 'skill' as const, label: s.name })),
        ],
        edges: skillRows.map((s) => ({
          fromNodeType: 'user',
          fromEntityId: userId,
          fromLabel: 'User',
          toNodeType: 'skill',
          toLabel: s.name,
          relationship: 'HAS_SKILL',
          evidence: [{ source: 'graph_backfill', proficiency: s.proficiency }],
        })),
      })
      console.log(`  [backfill] Created ${skillRows.length} HAS_SKILL edges`)
    }

    // 3. Create WORKED_AT edges for work experiences
    if (workRows.length > 0) {
      await graphService.enrich(userId, {
        nodes: [
          { type: 'user', entityId: userId, label: 'User' },
          ...workRows.map((w) => ({ type: 'company' as const, label: w.companyName })),
        ],
        edges: workRows.map((w) => ({
          fromNodeType: 'user',
          fromEntityId: userId,
          fromLabel: 'User',
          toNodeType: 'company',
          toLabel: w.companyName,
          relationship: 'WORKED_AT',
          evidence: [{ source: 'graph_backfill', title: w.title, startDate: w.startDate, endDate: w.endDate }],
        })),
      })
      console.log(`  [backfill] Created ${workRows.length} WORKED_AT edges`)
    }

    // 4. Create opportunity nodes + REQUIRES edges for required skills
    for (const opp of oppRows) {
      const requiredSkills: string[] = opp.requiredSkills ?? []
      if (requiredSkills.length === 0) continue
      await graphService.enrich(userId, {
        nodes: [
          { type: 'opportunity', entityId: opp.id, label: opp.roleTitle },
          ...requiredSkills.map((s) => ({ type: 'skill' as const, label: s })),
        ],
        edges: requiredSkills.map((s) => ({
          fromNodeType: 'opportunity',
          fromEntityId: opp.id,
          fromLabel: opp.roleTitle,
          toNodeType: 'skill',
          toLabel: s,
          relationship: 'REQUIRES',
          evidence: [{ source: 'graph_backfill' }],
        })),
      })
    }
    if (oppRows.length > 0) {
      console.log(`  [backfill] Created REQUIRES edges for ${oppRows.length} opportunities`)
    }

    // 5. Run all inference passes
    console.log(`  [backfill] Running inferences...`)
    await graphService.inferStrengths(userId)
    await graphService.inferWeaknesses(userId)
    await graphService.inferInterests(userId)
    await graphService.inferCareerThemes(userId)
    console.log(`  [backfill] Inferences complete for user ${userId}`)
  }

  console.log('[backfill] Done.')
  process.exit(0)
}

backfill().catch((err) => {
  console.error('[backfill] Fatal error:', err)
  process.exit(1)
})
