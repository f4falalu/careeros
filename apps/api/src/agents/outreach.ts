// Outreach Agent — drafts recruiter/HM/founder/referral messages.
// Guardrail: always persists as 'draft', needs_approval=true. No send capability.
// Writes: outreach_messages row (state='draft'); graph CONNECTED_TO edge; Qdrant outreach_intelligence

import { z } from 'zod'
import { db, schema } from '../db/index.js'
import { eq } from 'drizzle-orm'
import { generateStructured, embed } from '../router/modelRouter.js'
import { markRunning, markSucceeded, markFailed } from './lib/task.js'
import { qdrantUpsert } from '../lib/qdrant.js'
import { randomUUID } from 'crypto'
import type { MemoryService } from '../services/memory.js'
import type { GraphService } from '../services/graph.js'

const OutreachDraftSchema = z.object({
  channel: z.enum(['email', 'linkedin', 'telegram', 'whatsapp', 'other']),
  subject: z.string().nullable().optional(),
  body: z.string().max(2_000),
  contact_role: z.enum(['recruiter', 'hiring_manager', 'founder', 'referral', 'other']),
})

type OutreachDraft = z.infer<typeof OutreachDraftSchema>

export async function runOutreachAgent(
  input: {
    taskId: string
    userId: string
    opportunityId: string
    contactRole?: string
    channel?: string
    contactId?: string
  },
  memoryService?: MemoryService,
  graphService?: GraphService,
): Promise<Record<string, unknown>> {
  await markRunning(input.taskId)

  const [opportunity] = await db
    .select()
    .from(schema.opportunities)
    .where(eq(schema.opportunities.id, input.opportunityId))

  if (!opportunity) {
    await markFailed(input.taskId, 'Opportunity not found')
    return { error: 'Opportunity not found' }
  }

  // 1. Load candidate profile via MemoryService if available
  let profileSnippet: string
  let toneDefault: string

  if (memoryService) {
    const ctx = await memoryService.assembleContext(input.userId, {
      entityType: 'opportunity',
      entityId: input.opportunityId,
    })
    toneDefault = ((ctx.profile as Record<string, unknown>)?.tonePrefs as Record<string, unknown>)?.default as string ?? 'warm'
    profileSnippet =
      ctx.achievements.length > 0
        ? ctx.achievements.slice(0, 4).map((a) => a.summary).join('\n')
        : JSON.stringify((ctx.profile as Record<string, unknown>)?.masterResume ?? {}).slice(0, 800)
  } else {
    const [profile] = await db.select().from(schema.profiles).where(eq(schema.profiles.userId, input.userId))
    const achievements = await db.select().from(schema.achievements).where(eq(schema.achievements.userId, input.userId))
    toneDefault = ((profile?.tonePrefs as Record<string, unknown> | null)?.default as string) ?? 'warm'
    profileSnippet =
      achievements.length > 0
        ? achievements.slice(0, 4).map((a) => a.summary).join('\n')
        : JSON.stringify(profile?.masterResume ?? {}).slice(0, 800)
  }

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

  // 3. Load contact details
  let contactContext = ''
  let contactName: string | null = null
  if (input.contactId) {
    const [contact] = await db
      .select()
      .from(schema.contacts)
      .where(eq(schema.contacts.id, input.contactId))

    if (contact) {
      contactName = contact.name
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

  // 5. Persist as draft
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

  // 6. Graph enrichment: CONNECTED_TO edge for recruiter/contact
  if (graphService && input.contactId && contactName) {
    try {
      await graphService.enrich(input.userId, {
        nodes: [
          { type: 'user', label: 'User', entityId: input.userId },
          { type: 'recruiter', entityId: input.contactId, label: contactName },
        ],
        edges: [
          {
            fromNodeType: 'user',
            fromEntityId: input.userId,
            fromLabel: 'User',
            toNodeType: 'recruiter',
            toEntityId: input.contactId,
            toLabel: contactName,
            relationship: 'CONNECTED_TO',
            evidence: [
              {
                source: 'outreach_agent',
                channel: draft.channel,
                contactRole,
                opportunityId: input.opportunityId,
                sentiment: 'outreach_initiated',
              },
            ],
          },
        ],
      })
    } catch (err) {
      console.error('[outreach] graph enrich error (non-blocking):', String(err))
    }
  }

  // 7. Save to Qdrant outreach_intelligence
  try {
    const outreachText = `Outreach to ${contactRole} at ${opportunity.roleTitle}. Channel: ${channel}. ${draft.body.slice(0, 300)}`
    const vector = await embed(outreachText)
    await qdrantUpsert('outreach_intelligence', randomUUID(), vector, {
      userId: input.userId,
      entityType: 'outreach',
      entityId: saved.id,
      content: outreachText,
      channel: draft.channel,
      agentName: 'outreach',
      createdAt: new Date().toISOString(),
      contactRole,
    })
  } catch (err) {
    console.error('[outreach] qdrant upsert error (non-blocking):', String(err))
  }

  // 8. Save observation
  if (memoryService) {
    try {
      await memoryService.saveObservation(
        input.userId,
        'outreach',
        `Drafted ${contactRole} outreach for ${opportunity.roleTitle} via ${channel}. Pending approval.`,
        'outreach',
        saved.id,
      )
    } catch (err) {
      console.error('[outreach] saveObservation error (non-blocking):', String(err))
    }
  }

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
    toolsUsed: ['memory_service', 'db_brief', 'graph_enrich', 'qdrant_outreach'],
    costUsd: 0,
  })

  return { ...output, modelKind, modelName, toolsUsed: ['memory_service', 'db_brief'], costUsd: 0 }
}
