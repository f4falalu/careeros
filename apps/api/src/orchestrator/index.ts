import { db, schema } from '../db/index.js'
import { eq } from 'drizzle-orm'
import { enqueueAgent } from '../workers/queue.js'

// ── Input / output types ──────────────────────────────────────────────────────

export interface IntakeInput {
  url?: string
  text?: string
  filePath?: string
  sourceChannel: 'telegram' | 'whatsapp' | 'web' | 'manual' | 'job_board'
}

export interface IntakeResult {
  opportunityId: string
  /** Formatted chat reply sent back to the user immediately. */
  message: string
}

export interface MenuActionInput {
  opportunityId: string
  actions: string[]
  sourceChannel: string
}

export interface MenuActionResult {
  message: string
  taskIds: string[]
}

// ── handleIntake ──────────────────────────────────────────────────────────────

/**
 * Receives a normalised intake event (URL / plain text / PDF path), persists a
 * placeholder Opportunity + AgentTask, enqueues the intake agent, and returns a
 * user-friendly acknowledgement message.
 */
export async function handleIntake(input: IntakeInput): Promise<IntakeResult> {
  try {
    // 1. Resolve or create the single owner (v1: always the first user in the DB).
    let [user] = await db.select().from(schema.users).limit(1)
    if (!user) {
      ;[user] = await db
        .insert(schema.users)
        .values({ displayName: 'Owner' })
        .returning()
    }

    // 2. Create a placeholder Opportunity row so downstream tasks have a stable FK.
    const [opportunity] = await db
      .insert(schema.opportunities)
      .values({
        userId: user.id,
        roleTitle: 'Analyzing...',
        sourceChannel: input.sourceChannel,
        sourceUrl: input.url ?? null,
      })
      .returning()

    // 3. Record the AgentTask (required by the audit contract in CLAUDE.md).
    const [intakeTask] = await db
      .insert(schema.agentTasks)
      .values({
        userId: user.id,
        agentName: 'intake',
        status: 'queued',
        sourceChannel: input.sourceChannel,
        relatedType: 'opportunity',
        relatedId: opportunity.id,
        input: input as Record<string, unknown>,
      })
      .returning()

    // 4. Push the job onto the BullMQ queue.
    await enqueueAgent('intake', {
      taskId: intakeTask.id,
      userId: user.id,
      opportunityId: opportunity.id,
      ...input,
    })

    return {
      opportunityId: opportunity.id,
      message: `Got it! Analyzing the job posting... I'll send you a summary shortly.\n\n_Task ID: ${intakeTask.id}_`,
    }
  } catch (err) {
    console.error('[orchestrator] handleIntake error:', err)
    return {
      opportunityId: '',
      message: 'Sorry, I could not process that right now. Please try again in a moment.',
    }
  }
}

// ── handleMenuAction ──────────────────────────────────────────────────────────

/**
 * Dispatches one or more menu-selected actions (tailor_resume, cover_letter, etc.)
 * for an existing opportunity.
 */
export async function handleMenuAction(input: MenuActionInput): Promise<MenuActionResult> {
  try {
    const [user] = await db.select().from(schema.users).limit(1)
    if (!user) return { message: 'No user found.', taskIds: [] }

    const taskIds: string[] = []
    const messages: string[] = []

    for (const action of input.actions) {
      switch (action) {
        case 'tailor_resume': {
          const [task] = await db
            .insert(schema.agentTasks)
            .values({
              userId: user.id,
              agentName: 'resume',
              status: 'queued',
              sourceChannel: input.sourceChannel,
              relatedType: 'opportunity',
              relatedId: input.opportunityId,
              input: { opportunityId: input.opportunityId },
            })
            .returning()
          await enqueueAgent('resume', {
            taskId: task.id,
            userId: user.id,
            opportunityId: input.opportunityId,
          })
          taskIds.push(task.id)
          messages.push('Tailoring resume...')
          break
        }

        case 'cover_letter': {
          const [task] = await db
            .insert(schema.agentTasks)
            .values({
              userId: user.id,
              agentName: 'cover',
              status: 'queued',
              sourceChannel: input.sourceChannel,
              relatedType: 'opportunity',
              relatedId: input.opportunityId,
              input: { opportunityId: input.opportunityId },
            })
            .returning()
          await enqueueAgent('cover', {
            taskId: task.id,
            userId: user.id,
            opportunityId: input.opportunityId,
          })
          taskIds.push(task.id)
          messages.push('Drafting cover letter...')
          break
        }

        case 'mark_applied': {
          // Direct DB write — no agent needed.
          const existing = await db
            .select()
            .from(schema.applications)
            .where(eq(schema.applications.opportunityId, input.opportunityId))
            .limit(1)

          if (existing.length === 0) {
            await db.insert(schema.applications).values({
              userId: user.id,
              opportunityId: input.opportunityId,
              stage: 'applied',
              appliedAt: new Date(),
            })
          } else {
            await db
              .update(schema.applications)
              .set({ stage: 'applied', appliedAt: new Date() })
              .where(eq(schema.applications.id, existing[0].id))
          }
          messages.push('Marked as applied!')
          break
        }

        case 'build_vvp':
          messages.push('VVP coming in Phase 2!')
          break

        case 'draft_outreach':
          messages.push('Outreach drafting coming in Phase 2!')
          break

        default:
          console.warn('[orchestrator] Unknown menu action:', action)
      }
    }

    return { message: messages.join('\n'), taskIds }
  } catch (err) {
    console.error('[orchestrator] handleMenuAction error:', err)
    return { message: 'Sorry, something went wrong. Please try again.', taskIds: [] }
  }
}

// ── notifyIntakeComplete ──────────────────────────────────────────────────────

/**
 * Called by the intake agent after it completes analysis.
 * Returns the formatted Telegram/chat message with summary + action menu.
 * The caller (agent → WS broadcast or Telegram re-ping) is responsible for delivery.
 */
export function notifyIntakeComplete(params: {
  opportunityId: string
  companyName: string
  roleTitle: string
  matchScore?: number
  missingSkills?: string[]
}): string {
  const score = params.matchScore ?? null
  const missing = params.missingSkills ?? []

  const headline =
    `*${params.companyName} · ${params.roleTitle}*` +
    (score !== null ? ` · match ${score}%` : '')

  const missingLine = missing.length > 0 ? `\nMissing: ${missing.join(', ')}` : ''

  const menu = [
    '1 Tailor resume',
    '2 Build VVP',
    '3 Draft outreach',
    '4 Cover letter',
    '5 Mark applied',
  ].join('  |  ')

  return `${headline}${missingLine}\n\n${menu}`
}
