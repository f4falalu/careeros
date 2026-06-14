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

    const { eq } = await import('drizzle-orm')

    // 1. Always create the user node first, regardless of whether data exists
    await graphService.enrich(userId, {
      nodes: [{ type: 'user', entityId: userId, label: 'User' }],
      edges: [],
    })

    // 2. Load all profile data
    const [skillRows, workRows, oppRows, projectRows, achievementRows] = await Promise.all([
      db.select().from(schema.skills).where(eq(schema.skills.userId, userId)),
      db.select().from(schema.workExperiences).where(eq(schema.workExperiences.userId, userId)),
      db.select().from(schema.opportunities).where(eq(schema.opportunities.userId, userId)),
      db.select().from(schema.profileProjects).where(eq(schema.profileProjects.userId, userId)),
      db.select().from(schema.achievements).where(eq(schema.achievements.userId, userId)),
    ])

    // 3. HAS_SKILL edges
    if (skillRows.length > 0) {
      await graphService.enrich(userId, {
        nodes: skillRows.map((s) => ({ type: 'skill' as const, label: s.name })),
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

    // 4. WORKED_AT edges for work experiences
    if (workRows.length > 0) {
      await graphService.enrich(userId, {
        nodes: workRows.map((w) => ({ type: 'company' as const, label: w.companyName })),
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

    // 5. BUILT edges for profile projects
    if (projectRows.length > 0) {
      await graphService.enrich(userId, {
        nodes: projectRows.map((p) => ({ type: 'project' as const, entityId: p.id, label: p.title })),
        edges: projectRows.map((p) => ({
          fromNodeType: 'user',
          fromEntityId: userId,
          fromLabel: 'User',
          toNodeType: 'project',
          toEntityId: p.id,
          toLabel: p.title,
          relationship: 'BUILT',
          evidence: [{ source: 'graph_backfill', tools: p.tools }],
        })),
      })
      console.log(`  [backfill] Created ${projectRows.length} BUILT edges`)
    }

    // 6. DEMONSTRATES edges for achievements → skills
    for (const achievement of achievementRows) {
      const skills: string[] = achievement.skills ?? []
      if (skills.length === 0) continue
      await graphService.enrich(userId, {
        nodes: [
          { type: 'experience' as const, entityId: achievement.id, label: achievement.summary.slice(0, 80) },
          ...skills.map((s) => ({ type: 'skill' as const, label: s })),
        ],
        edges: skills.map((s) => ({
          fromNodeType: 'experience',
          fromEntityId: achievement.id,
          fromLabel: achievement.summary.slice(0, 80),
          toNodeType: 'skill',
          toLabel: s,
          relationship: 'DEMONSTRATES',
          evidence: [{ source: 'graph_backfill', achievementId: achievement.id }],
        })),
      })
    }
    if (achievementRows.length > 0) {
      console.log(`  [backfill] Created DEMONSTRATES edges for ${achievementRows.length} achievements`)
    }

    // 7. REQUIRES edges for opportunities
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

    // 8. Run all inference passes
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
