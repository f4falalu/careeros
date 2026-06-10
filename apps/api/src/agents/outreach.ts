// Outreach Agent — drafts recruiter/HM/founder/referral messages.
// Guardrail: always persists as 'draft', needs_approval=true. No send capability.
// Writes: outreach_messages row (state='draft')

import { z } from 'zod'
import { db, schema } from '../db/index.js'
import { eq } from 'drizzle-orm'
import { generateStructured } from '../router/modelRouter.js'
import { markRunning, markSucceeded, markFailed } from './lib/task.js'

// ─────────────────────────────────────────────────────────────
// Output schema
// ─────────────────────────────────────────────────────────────

const OutreachDraftSchema = z.object({
  channel: z.enum(['email', 'linkedin', 'telegram', 'whatsapp', 'other']),
  subject: z.string().nullable().optional(),
  body: z.string().max(2_000),
  contact_role: z.enum(['recruiter', 'hiring_manager', 'founder', 'referral', 'other']),
})

type OutreachDraft = z.infer<typeof OutreachDraftSchema>

// ─────────────────────────────────────────────────────────────
// Agent entry point
// ─────────────────────────────────────────────────────────────

export async function runOutreachAgent(input: {
  taskId: string
  userId: string
  opportunityId: string
  contactRole?: string
  channel?: string
  contactId?: string
}): Promise<Record<string, unknown>> {
  await markRunning(input.taskId)

  const [opportunity] = await db
    .select()
    .from(schema.opportunities)
    .where(eq(schema.opportunities.id, input.opportunityId))

  if (!opportunity) {
    await markFailed(input.taskId, 'Opportunity not found')
    return { error: 'Opportunity not found' }
  }

  // 1. Load candidate profile + tone prefs
  const [profile] = await db
    .select()
    .from(schema.profiles)
    .where(eq(schema.profiles.userId, input.userId))

  const achievements = await db
    .select()
    .from(schema.achievements)
    .where(eq(schema.achievements.userId, input.userId))

  const tonePrefs = (profile?.tonePrefs as Record<string, unknown> | null) ?? {}
  const toneDefault = (tonePrefs.default as string) ?? 'warm'

  const profileSnippet =
    achievements.length > 0
      ? achievements
          .slice(0, 4)
          .map((a) => a.summary)
          .join('\n')
      : JSON.stringify(profile?.masterResume ?? {}).slice(0, 800)

  // 2. Load company brief for hooks
  let briefSnippet = ''
  if (opportunity.companyId) {
    const [brief] = await db
      .select()
      .from(schema.companyBriefs)
      .where(eq(schema.companyBriefs.companyId, opportunity.companyId))

    if (brief) {
      const bc = brief.content as Record<string, unknown>
      briefSnippet = [
        bc.business_model ? `Business: ${bc.business_model}` : null,
        bc.funding ? `Funding: ${bc.funding}` : null,
        Array.isArray(bc.recent_news) && bc.recent_news.length > 0
          ? `Recent news: ${(bc.recent_news as string[]).slice(0, 2).join('. ')}`
          : null,
        Array.isArray(bc.hiring_signals) && bc.hiring_signals.length > 0
          ? `Hiring signals: ${(bc.hiring_signals as string[]).slice(0, 2).join('. ')}`
          : null,
      ]
        .filter(Boolean)
        .join('\n')
    }
  }

  // 3. Load contact details (optional)
  let contactContext = ''
  if (input.contactId) {
    const [contact] = await db
      .select()
      .from(schema.contacts)
      .where(eq(schema.contacts.id, input.contactId))

    if (contact) {
      contactContext = `Contact: ${contact.name}${contact.title ? ` (${contact.title})` : ''}`
    }
  }

  const contactRole = (input.contactRole ?? 'recruiter') as OutreachDraft['contact_role']
  const channel = (input.channel ?? 'email') as OutreachDraft['channel']

  // 4. Generate draft
  const prompt = `Draft a ${contactRole} outreach message via ${channel} for a job candidate. Tone: ${toneDefault}.

You are drafting ONLY — this will NOT be sent without explicit human approval.

Role being applied to: ${opportunity.roleTitle}
${contactContext}

Company context (use for specific hooks):
${briefSnippet || 'No company research available yet.'}

Candidate background (real facts only — do not fabricate):
${profileSnippet}

Rules:
- Be specific and non-generic; mention something real about the company
- Keep it concise (under 150 words for LinkedIn/telegram, under 200 words for email)
- Do NOT claim skills or experience the candidate doesn't have
- Do NOT include a sending date or placeholder brackets like [NAME]
- Return channel as "${channel}" and contact_role as "${contactRole}"`

  let draft: OutreachDraft
  let modelKind: string
  let modelName: string

  try {
    const result = await generateStructured(prompt, OutreachDraftSchema, {
      taskType: 'outreach',
      containsPersonalData: true,
      allowCloud: false,
    })
    draft = result.data
    modelKind = result.modelKind
    modelName = result.modelName
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await markFailed(input.taskId, `Outreach draft failed: ${msg}`)
    return { error: `Outreach draft failed: ${msg}` }
  }

  // 5. Persist as draft — state is always 'draft', never sent automatically
  const [saved] = await db
    .insert(schema.outreachMessages)
    .values({
      userId: input.userId,
      opportunityId: input.opportunityId,
      contactId: input.contactId ?? null,
      channel: draft.channel,
      subject: draft.subject ?? null,
      body: draft.body,
      state: 'draft',
    })
    .returning()

  const output = {
    outreachId: saved.id,
    channel: draft.channel,
    contactRole: draft.contact_role,
    subject: draft.subject ?? null,
    body: draft.body,
    state: 'draft',
    needsApproval: true,
  }

  await markSucceeded(input.taskId, {
    output,
    modelKind,
    modelName,
    toolsUsed: ['db_profile', 'db_brief'],
    costUsd: 0,
  })

  return {
    ...output,
    modelKind,
    modelName,
    toolsUsed: ['db_profile', 'db_brief'],
    costUsd: 0,
  }
}
