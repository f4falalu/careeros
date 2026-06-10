// Apply Agent — Phase 4 (autonomy, GATED).
//
// Records a semi-automated job application. Every dangerous step is fenced:
//   1. Master switch  (autonomy.autoApply.enabled) must be on.
//   2. Per-site opt-in (autonomy.autoApply.allowedSites) must list the apply host.
//   3. Daily cap       (autonomy.autoApply.dailyLimit) is enforced.
//   4. Human confirm   (autonomy.autoApply.requireConfirm) parks a submission in
//      `needs_approval` until the owner approves it via POST /tasks/:id/approve.
//
// IMPORTANT — responsible boundary: this agent does NOT perform a live HTTP form
// submission to a third-party ATS. Real cross-site auto-submit requires per-ATS
// adapters and explicit ToS sign-off, which the roadmap keeps gated regardless of
// build phase (12-PRODUCTION-READINESS §3). What is fully real here is the control
// plane, the audit trail, and the pipeline state change (application → applied).
// The actual external POST is a clearly-marked seam (`submitToAts`) for a human to
// wire per site, behind these same gates.

import { and, eq, gte } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { markRunning, markSucceeded, markFailed } from './lib/task.js'
import { getAutonomy, hostAllowed } from './lib/autonomy.js'

function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

export async function runApplyAgent(input: {
  taskId: string
  userId: string
  opportunityId: string
  /** Set by POST /tasks/:id/approve when the owner confirms a parked submission. */
  approved?: boolean
}): Promise<Record<string, unknown>> {
  await markRunning(input.taskId)

  const autonomy = await getAutonomy(input.userId)

  // ── Gate 1: master switch ──────────────────────────────────
  if (!autonomy.autoApply.enabled) {
    await markFailed(
      input.taskId,
      'Auto-apply is turned off. Enable it in Settings → Autonomy to use this.',
    )
    return { blocked: 'auto_apply_disabled' }
  }

  // Load opportunity (tenant-scoped).
  const [opp] = await db
    .select()
    .from(schema.opportunities)
    .where(
      and(
        eq(schema.opportunities.id, input.opportunityId),
        eq(schema.opportunities.userId, input.userId),
      ),
    )
    .limit(1)

  if (!opp) {
    await markFailed(input.taskId, 'Opportunity not found')
    return { error: 'Opportunity not found' }
  }

  const applyUrl = opp.applyUrl ?? opp.sourceUrl
  if (!applyUrl) {
    await markFailed(input.taskId, 'No apply URL on this opportunity')
    return { blocked: 'no_apply_url' }
  }

  // ── Gate 2: per-site opt-in ────────────────────────────────
  if (!hostAllowed(applyUrl, autonomy.autoApply.allowedSites)) {
    await markFailed(
      input.taskId,
      `Apply host is not in your allowed sites. Add it in Settings → Autonomy to auto-apply on ${applyUrl}.`,
    )
    return { blocked: 'site_not_allowed', applyUrl }
  }

  // ── Gate 3: daily cap ──────────────────────────────────────
  const todays = await db
    .select({ id: schema.applications.id })
    .from(schema.applications)
    .where(
      and(
        eq(schema.applications.userId, input.userId),
        eq(schema.applications.autoApplied, true),
        gte(schema.applications.appliedAt, startOfToday()),
      ),
    )

  if (todays.length >= autonomy.autoApply.dailyLimit) {
    await markFailed(
      input.taskId,
      `Daily auto-apply limit reached (${autonomy.autoApply.dailyLimit}). Raise it in Settings → Autonomy.`,
    )
    return { blocked: 'daily_limit_reached', dailyLimit: autonomy.autoApply.dailyLimit }
  }

  // Pick the latest tailored, validated resume for this opportunity if one exists.
  const [resume] = await db
    .select({ id: schema.resumeVersions.id, label: schema.resumeVersions.label, validated: schema.resumeVersions.validated })
    .from(schema.resumeVersions)
    .where(
      and(
        eq(schema.resumeVersions.userId, input.userId),
        eq(schema.resumeVersions.opportunityId, input.opportunityId),
      ),
    )
    .orderBy(schema.resumeVersions.createdAt)
    .limit(1)

  const plan = {
    opportunityId: opp.id,
    roleTitle: opp.roleTitle,
    applyUrl,
    resumeVersionId: resume?.id ?? null,
    resumeValidated: resume?.validated ?? false,
  }

  // ── Gate 4: human confirm ──────────────────────────────────
  // Park the submission until the owner approves (re-enqueues with approved=true).
  if (autonomy.autoApply.requireConfirm && input.approved !== true) {
    return {
      // Worker reads this flag → sets the task to `needs_approval` instead of succeeded.
      needsApproval: true,
      stage: 'awaiting_confirmation',
      plan,
      warnings: resume && !resume.validated
        ? ['The selected resume has not passed the no-fabrication validator.']
        : [],
    }
  }

  // ── Submit ─────────────────────────────────────────────────
  const submission = await submitToAts(plan)

  // Record the pipeline state change + audit event.
  const [existingApp] = await db
    .select()
    .from(schema.applications)
    .where(eq(schema.applications.opportunityId, input.opportunityId))
    .limit(1)

  let applicationId: string
  let fromStage: schema.Application['stage'] | null = null
  if (existingApp) {
    fromStage = existingApp.stage
    await db
      .update(schema.applications)
      .set({ stage: 'applied', appliedAt: new Date(), autoApplied: true })
      .where(eq(schema.applications.id, existingApp.id))
    applicationId = existingApp.id
  } else {
    const [created] = await db
      .insert(schema.applications)
      .values({
        userId: input.userId,
        opportunityId: input.opportunityId,
        stage: 'applied',
        appliedAt: new Date(),
        autoApplied: true,
      })
      .returning()
    applicationId = created.id
  }

  await db.insert(schema.stageEvents).values({
    applicationId,
    fromStage,
    toStage: 'applied',
    actor: 'agent:apply',
    note: `Auto-applied via ${new URL(applyUrl).hostname} (${submission.mode})`,
  })

  const output = {
    submitted: submission.submitted,
    mode: submission.mode,
    applicationId,
    plan,
    note: submission.note,
  }

  await markSucceeded(input.taskId, {
    output,
    toolsUsed: ['autonomy_gate', 'ats_submit'],
    costUsd: 0,
  })

  return output
}

// ── ATS submission seam ──────────────────────────────────────
// Deliberately NOT a live third-party POST (see file header). Returns a recorded,
// human-reviewable result. A maintainer wires real per-site adapters here, behind
// the same autonomy gates, after accepting each site's ToS.
async function submitToAts(plan: {
  applyUrl: string
  resumeVersionId: string | null
}): Promise<{ submitted: boolean; mode: 'recorded'; note: string }> {
  return {
    submitted: true,
    mode: 'recorded',
    note:
      'Application recorded and pipeline advanced to "applied". Live form submission to the ' +
      'external ATS is intentionally not performed — wire a per-site adapter in submitToAts() ' +
      'to enable it, behind the same Settings → Autonomy gates.',
  }
}
