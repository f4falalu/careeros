import { and, desc, eq, isNull } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import type { DB } from '../db/index.js'
import { schema } from '../db/index.js'
import { embed, complete } from '../router/modelRouter.js'
import { qdrantUpsert } from '../lib/qdrant.js'
import { enqueueAgent } from '../workers/queue.js'
import type { MemoryService, WorkspaceContext } from './memory.js'

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type ConversationChannel = 'web' | 'telegram' | 'whatsapp'

export interface ApprovalPayload {
  type: 'resume' | 'vvp' | 'outreach' | 'apply'
  entityId: string
  actions: ['approve', 'review', 'reject']
}

export interface ConversationResponse {
  messageId: string
  response: string
  pendingApproval?: ApprovalPayload
}

// ─────────────────────────────────────────────────────────────
// Intent keywords
// ─────────────────────────────────────────────────────────────

function detectIntent(content: string): 'intake' | 'resume' | 'vvp' | 'outreach' | 'interview' | 'graph_patterns' | 'graph_evidence' | 'graph_gaps' | 'graph_opportunities' | 'general' {
  const lower = content.toLowerCase()
  if (/https?:\/\/\S+/.test(content)) return 'intake'
  if (/tailor.*(resume|cv)|resume.*tailor|update.*resume/.test(lower)) return 'resume'
  if (/generate.*vvp|build.*vvp|vvp|value.*project/.test(lower)) return 'vvp'
  if (/draft.*outreach|outreach.*draft|message.*recruiter|recruiter.*message|contact/.test(lower)) return 'outreach'
  if (/prep.*interview|interview.*prep|interview brief|mock interview/.test(lower)) return 'interview'
  if (/pattern|career trajectory|career theme/.test(lower)) return 'graph_patterns'
  if (/evidence|what.*done|show.*experience/.test(lower)) return 'graph_evidence'
  if (/skill.*missing|gap|missing.*skill|need to learn/.test(lower)) return 'graph_gaps'
  if (/best.*opportunit|top.*opportunit|recommend.*job|which.*role/.test(lower)) return 'graph_opportunities'
  return 'general'
}

// ─────────────────────────────────────────────────────────────
// ConversationService
// ─────────────────────────────────────────────────────────────

export class ConversationService {
  constructor(
    private db: DB,
    private memoryService: MemoryService,
  ) {}

  // ── getOrCreateConversation ───────────────────────────────────

  async getOrCreateConversation(
    userId: string,
    channel: ConversationChannel,
    externalThreadId?: string,
  ): Promise<typeof schema.conversations.$inferSelect> {
    // Try to find existing by (userId, channel, externalThreadId)
    if (externalThreadId) {
      const [existing] = await this.db
        .select()
        .from(schema.conversations)
        .where(
          and(
            eq(schema.conversations.userId, userId),
            eq(schema.conversations.channel, channel),
            eq(schema.conversations.externalThreadId, externalThreadId),
          ),
        )
        .limit(1)

      if (existing) return existing
    } else {
      // For web: find a conversation without external thread id
      const [existing] = await this.db
        .select()
        .from(schema.conversations)
        .where(
          and(
            eq(schema.conversations.userId, userId),
            eq(schema.conversations.channel, channel),
            isNull(schema.conversations.externalThreadId),
          ),
        )
        .limit(1)

      if (existing) return existing
    }

    const [created] = await this.db
      .insert(schema.conversations)
      .values({
        userId,
        channel,
        externalThreadId: externalThreadId ?? null,
        workspaceContext: {},
      })
      .returning()

    return created
  }

  // ── handleMessage ─────────────────────────────────────────────

  async handleMessage(
    userId: string,
    channel: ConversationChannel,
    content: string,
    workspaceContext?: WorkspaceContext,
    externalThreadId?: string,
  ): Promise<ConversationResponse> {
    // 1. Get or create conversation
    const conversation = await this.getOrCreateConversation(userId, channel, externalThreadId)

    // 2. Persist user message
    const [userMessage] = await this.db
      .insert(schema.conversationMessages)
      .values({
        conversationId: conversation.id,
        role: 'user',
        content,
        metadata: { workspaceContext: workspaceContext ?? {} },
      })
      .returning()

    // 3. Embed and save to Qdrant career_conversations
    this.saveMessageToQdrant(userId, content, 'user', channel, userMessage.id).catch((e) =>
      console.error('[ConversationService] qdrant save error:', String(e)),
    )

    // 4. Assemble context
    const ctx = await this.memoryService.assembleContext(userId, workspaceContext)

    // 5. Detect intent and route
    const intent = detectIntent(content)
    let response = ''
    let pendingApproval: ApprovalPayload | undefined

    try {
      switch (intent) {
        case 'intake': {
          // Extract URL and create an opportunity via intake agent
          const urlMatch = content.match(/https?:\/\/\S+/)
          const url = urlMatch?.[0]
          const [opp] = await this.db
            .insert(schema.opportunities)
            .values({ userId, roleTitle: 'Pending extraction', workModel: 'unknown' })
            .returning()
          const [task] = await this.db
            .insert(schema.agentTasks)
            .values({
              userId,
              agentName: 'intake',
              status: 'queued',
              sourceChannel: channel,
              relatedType: 'opportunity',
              relatedId: opp.id,
              input: { opportunityId: opp.id, url, text: url ? undefined : content },
            })
            .returning()
          await enqueueAgent('intake', {
            taskId: task.id,
            userId,
            opportunityId: opp.id,
            ...(url ? { url } : { text: content }),
          })
          response = `Got it! I'm extracting the job details from that link. I'll have your match score and suggested next steps ready in a moment. (Opportunity ID: \`${opp.id}\`)`
          break
        }

        case 'resume': {
          const opportunityId = workspaceContext?.entityType === 'opportunity' ? workspaceContext.entityId : undefined
          if (opportunityId) {
            const [user] = await this.db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1)
            const [task] = await this.db
              .insert(schema.agentTasks)
              .values({
                userId,
                agentName: 'resume',
                status: 'queued',
                sourceChannel: channel,
                relatedType: 'opportunity',
                relatedId: opportunityId,
                input: { opportunityId },
              })
              .returning()
            await enqueueAgent('resume', { taskId: task.id, userId, opportunityId })
            response = `Tailoring your resume for this opportunity. I'll notify you when it's ready for review.`
          } else {
            response = await this.generalResponse(content, ctx)
          }
          break
        }

        case 'vvp': {
          const opportunityId = workspaceContext?.entityType === 'opportunity' ? workspaceContext.entityId : undefined
          if (opportunityId) {
            const [task] = await this.db
              .insert(schema.agentTasks)
              .values({
                userId,
                agentName: 'vvp_propose',
                status: 'queued',
                sourceChannel: channel,
                relatedType: 'opportunity',
                relatedId: opportunityId,
                input: { opportunityId },
              })
              .returning()
            await enqueueAgent('vvp_propose', { taskId: task.id, userId, opportunityId })
            response = `Generating VVP angles for this opportunity. I'll send proposals for your review.`
          } else {
            response = await this.generalResponse(content, ctx)
          }
          break
        }

        case 'outreach': {
          const opportunityId = workspaceContext?.entityType === 'opportunity' ? workspaceContext.entityId : undefined
          if (opportunityId) {
            const [task] = await this.db
              .insert(schema.agentTasks)
              .values({
                userId,
                agentName: 'outreach',
                status: 'queued',
                sourceChannel: channel,
                relatedType: 'opportunity',
                relatedId: opportunityId,
                input: { opportunityId },
              })
              .returning()
            await enqueueAgent('outreach', { taskId: task.id, userId, opportunityId })
            response = `Drafting outreach message. I'll have a draft ready for your approval shortly.`
          } else {
            response = await this.generalResponse(content, ctx)
          }
          break
        }

        case 'interview': {
          const applicationId = workspaceContext?.entityType === 'application' ? workspaceContext.entityId : undefined
          if (applicationId) {
            const [task] = await this.db
              .insert(schema.agentTasks)
              .values({
                userId,
                agentName: 'interview_brief',
                status: 'queued',
                sourceChannel: channel,
                relatedType: 'application',
                relatedId: applicationId,
                input: { applicationId },
              })
              .returning()
            await enqueueAgent('interview_brief', { taskId: task.id, userId, applicationId })
            response = `Generating interview brief. I'll have it ready shortly.`
          } else {
            response = await this.generalResponse(content, ctx)
          }
          break
        }

        case 'graph_patterns': {
          const patterns = ctx.careerPatterns
          response = `Based on your career graph:\n\n**Strengths:** ${patterns.strengths.slice(0, 5).join(', ') || 'Still building your graph — add more achievements to unlock this'}\n\n**Industries:** ${patterns.industries.slice(0, 5).join(', ') || 'None detected yet'}\n\n**Career signals:** ${patterns.progressionSignals.slice(0, 3).join(', ') || 'Run /graph/infer to compute themes'}`
          break
        }

        case 'graph_evidence': {
          const concept = content.replace(/evidence|what.*done|show.*experience/gi, '').trim() || 'your work'
          const evidence = await this.memoryService.findEvidence(userId, concept)
          if (evidence.length > 0) {
            response = `Evidence for "${concept}":\n\n${evidence.slice(0, 5).map((e) => `• ${e.sourceNodeLabel} → ${e.targetNodeLabel} (confidence: ${Math.round(e.confidence * 100)}%)`).join('\n')}`
          } else {
            response = `No direct graph evidence found for "${concept}". Add achievements or run a resume tailoring session to build your evidence graph.`
          }
          break
        }

        case 'graph_gaps': {
          const opportunityId = workspaceContext?.entityType === 'opportunity' ? workspaceContext.entityId : undefined
          if (opportunityId) {
            const gaps = await this.memoryService.graphService.findMissingCapabilities(userId, opportunityId)
            response = gaps.length > 0
              ? `Skills you may need to develop for this role:\n\n${gaps.map((g) => `• ${g}`).join('\n')}`
              : `Your skill graph covers the core requirements for this role.`
          } else {
            const weaknesses = ctx.inferences.filter((i) => i.type === 'weakness').slice(0, 8)
            response = weaknesses.length > 0
              ? `Based on roles you've targeted, skills to develop:\n\n${weaknesses.map((w) => `• ${w.label}`).join('\n')}`
              : `No skill gaps detected yet. Apply to some roles to start tracking gaps.`
          }
          break
        }

        case 'graph_opportunities': {
          const ranked = await this.memoryService.graphService.recommendOpportunities(userId)
          if (ranked.length > 0) {
            response = `Top opportunities based on your graph:\n\n${ranked.slice(0, 5).map((r, i) => `${i + 1}. **${r.roleTitle}** — ${r.score}% match\n   ${r.rationale}`).join('\n\n')}`
          } else {
            response = `No saved opportunities to rank yet. Add some roles to your pipeline first.`
          }
          break
        }

        default:
          response = await this.generalResponse(content, ctx)
      }
    } catch (err) {
      console.error('[ConversationService] intent handling error:', String(err))
      response = `I encountered an issue processing that request. Please try again.`
    }

    // 6. Persist assistant response
    const metadata: Record<string, unknown> = {}
    if (pendingApproval) metadata.pendingApproval = pendingApproval

    const [assistantMessage] = await this.db
      .insert(schema.conversationMessages)
      .values({
        conversationId: conversation.id,
        role: 'assistant',
        content: response,
        metadata,
      })
      .returning()

    // 7. Save assistant message to Qdrant
    this.saveMessageToQdrant(userId, response, 'assistant', channel, assistantMessage.id).catch(
      (e) => console.error('[ConversationService] qdrant save error:', String(e)),
    )

    return { messageId: assistantMessage.id, response, pendingApproval }
  }

  // ── saveMessageToQdrant ───────────────────────────────────────

  private async saveMessageToQdrant(
    userId: string,
    content: string,
    role: string,
    channel: string,
    messageId: string,
  ): Promise<void> {
    const vector = await embed(content.slice(0, 2_000))
    await qdrantUpsert('career_conversations', messageId, vector, {
      userId,
      entityType: 'conversation_message',
      entityId: messageId,
      content: content.slice(0, 1_000),
      channel,
      agentName: null,
      createdAt: new Date().toISOString(),
      role,
    })
  }

  // ── generalResponse ───────────────────────────────────────────

  private async generalResponse(content: string, ctx: import('./memory.js').AssembledContext): Promise<string> {
    const systemContext = [
      `You are CareerOS Copilot — an intelligent career assistant with deep knowledge of the user's career graph.`,
      `User's top skills: ${ctx.skills.slice(0, 10).join(', ') || 'Not yet set'}`,
      `Career strengths: ${ctx.inferences.filter((i) => i.type === 'strength').slice(0, 5).map((i) => i.label).join(', ') || 'Not computed yet'}`,
      `Career themes: ${ctx.inferences.filter((i) => i.type === 'theme').slice(0, 3).map((i) => i.label).join(', ') || 'Not computed yet'}`,
      ctx.recentConversation.length > 0
        ? `Recent conversation:\n${ctx.recentConversation.join('\n')}`
        : '',
      ctx.workspaceData && Object.keys(ctx.workspaceData).length > 0
        ? `Current workspace: ${JSON.stringify(ctx.workspaceData).slice(0, 500)}`
        : '',
    ]
      .filter(Boolean)
      .join('\n\n')

    const prompt = `${systemContext}\n\nUser: ${content}\n\nRespond helpfully and concisely as CareerOS Copilot.`

    try {
      const { text } = await complete(prompt, {
        taskType: 'strategist',
        containsPersonalData: true,
      })
      return text
    } catch {
      return `I'm having trouble connecting to the AI model right now. Please try again in a moment.`
    }
  }

  // ── getHistory ────────────────────────────────────────────────

  async getHistory(
    userId: string,
    options?: { limit?: number; channel?: ConversationChannel },
  ): Promise<Array<{ id: string; role: string; content: string; channel: string; createdAt: Date }>> {
    const limit = options?.limit ?? 20

    const conv = await this.db
      .select({ id: schema.conversations.id })
      .from(schema.conversations)
      .where(
        options?.channel
          ? and(eq(schema.conversations.userId, userId), eq(schema.conversations.channel, options.channel))
          : eq(schema.conversations.userId, userId),
      )
      .orderBy(desc(schema.conversations.updatedAt))
      .limit(1)

    if (!conv.length) return []

    const rows = await this.db
      .select({
        id: schema.conversationMessages.id,
        role: schema.conversationMessages.role,
        content: schema.conversationMessages.content,
        createdAt: schema.conversationMessages.createdAt,
      })
      .from(schema.conversationMessages)
      .where(eq(schema.conversationMessages.conversationId, conv[0].id))
      .orderBy(desc(schema.conversationMessages.createdAt))
      .limit(limit)

    return rows.map((r) => ({
      ...r,
      channel: options?.channel ?? 'web',
    }))
  }

  // ── approveTask ───────────────────────────────────────────────

  async approveTask(userId: string, taskId: string): Promise<void> {
    const [task] = await this.db
      .select()
      .from(schema.agentTasks)
      .where(and(eq(schema.agentTasks.id, taskId), eq(schema.agentTasks.userId, userId)))
      .limit(1)

    if (!task || task.status !== 'needs_approval') return

    await this.db
      .update(schema.agentTasks)
      .set({ status: 'queued' })
      .where(eq(schema.agentTasks.id, taskId))

    await enqueueAgent(task.agentName, {
      ...(task.input as Record<string, unknown>),
      taskId: task.id,
      userId: task.userId,
      approved: true,
    })
  }
}
