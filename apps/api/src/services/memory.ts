import { and, desc, eq, inArray, ilike, or, sql } from 'drizzle-orm'
import type { DB } from '../db/index.js'
import { schema } from '../db/index.js'
import { embed } from '../router/modelRouter.js'
import { qdrantSearch, qdrantUpsert } from '../lib/qdrant.js'
import type { GraphService, CareerPatterns, EvidenceResult } from './graph.js'
import { randomUUID } from 'crypto'

// ─────────────────────────────────────────────────────────────
// Shared types
// ─────────────────────────────────────────────────────────────

export interface WorkspaceContext {
  entityType?: string
  entityId?: string
}

export interface OpportunityContext {
  opportunity: Record<string, unknown>
  company: Record<string, unknown> | null
  matchScore: number | null
  requiredSkills: string[]
  skillCoverage: string[]
  similarOpportunities: Array<{ content: string; score: number }>
}

export interface ExperienceResult {
  source: 'pgvector' | 'qdrant'
  id: string
  content: string
  score: number
}

export interface ProjectResult {
  source: 'pg' | 'qdrant'
  id: string
  title: string
  description: string
  score: number
}

export interface ConversationMessage {
  id: string
  role: string
  content: string
  metadata: unknown
  createdAt: Date
  channel?: string
}

export interface AssembledContext {
  profile: Record<string, unknown> | null
  skills: string[]
  achievements: Array<{ id: string; summary: string; skills: string[] | null }>
  workExperiences: Array<{ companyName: string; title: string; bullets: string[] }>
  inferences: Array<{ type: string; label: string; confidence: number }>
  careerPatterns: CareerPatterns
  recentConversation: string[]
  workspaceData: Record<string, unknown>
}

// ─────────────────────────────────────────────────────────────
// MemoryService
// ─────────────────────────────────────────────────────────────

export class MemoryService {
  constructor(
    private db: DB,
    public graphService: GraphService,
  ) {}

  // ── getOpportunityContext ─────────────────────────────────────

  async getOpportunityContext(userId: string, opportunityId: string): Promise<OpportunityContext> {
    const [opportunity] = await this.db
      .select()
      .from(schema.opportunities)
      .where(eq(schema.opportunities.id, opportunityId))
      .limit(1)

    if (!opportunity) {
      return {
        opportunity: {},
        company: null,
        matchScore: null,
        requiredSkills: [],
        skillCoverage: [],
        similarOpportunities: [],
      }
    }

    const [company, matchScore] = await Promise.all([
      opportunity.companyId
        ? this.db
            .select()
            .from(schema.companies)
            .where(eq(schema.companies.id, opportunity.companyId))
            .limit(1)
            .then((r) => r[0] ?? null)
        : Promise.resolve(null),
      this.db
        .select({ score: schema.matchScores.score })
        .from(schema.matchScores)
        .where(eq(schema.matchScores.opportunityId, opportunityId))
        .orderBy(desc(schema.matchScores.computedAt))
        .limit(1)
        .then((r) => (r[0] ? Number(r[0].score) : null)),
    ])

    const required = opportunity.requiredSkills ?? []
    const skillRel = await this.graphService.findSkillRelationships(userId, required[0] ?? '')
    const skillCoverage = skillRel.connectedNodes
      .filter((n) => n.type === 'skill')
      .map((n) => n.label)

    // Semantic search in Qdrant for similar past opportunities
    let similarOpportunities: Array<{ content: string; score: number }> = []
    if (opportunity.description) {
      const vector = await embed(opportunity.description.slice(0, 2_000))
      const results = await qdrantSearch('opportunity_context', vector, { userId }, 5)
      similarOpportunities = results.map((r) => ({ content: r.payload.content, score: r.score }))
    }

    return {
      opportunity: opportunity as unknown as Record<string, unknown>,
      company: company as Record<string, unknown> | null,
      matchScore,
      requiredSkills: required,
      skillCoverage,
      similarOpportunities,
    }
  }

  // ── findRelevantExperience ────────────────────────────────────

  async findRelevantExperience(userId: string, query: string): Promise<ExperienceResult[]> {
    const vector = await embed(query)

    // pgvector search on achievements
    const pgResults = await this.db
      .select({ id: schema.achievements.id, summary: schema.achievements.summary })
      .from(schema.achievements)
      .where(and(eq(schema.achievements.userId, userId), sql`${schema.achievements.embedding} IS NOT NULL`))
      .orderBy(sql`${schema.achievements.embedding} <=> ${`[${vector.join(',')}]`}`)
      .limit(10)

    const pgItems: ExperienceResult[] = pgResults.map((r) => ({
      source: 'pgvector',
      id: r.id,
      content: r.summary,
      score: 0.8, // pgvector distance doesn't expose score here; treat as high
    }))

    // Qdrant search on agent_observations
    const qdrantResults = await qdrantSearch('agent_observations', vector, { userId }, 5)
    const qdrantItems: ExperienceResult[] = qdrantResults.map((r) => ({
      source: 'qdrant',
      id: r.id,
      content: r.payload.content,
      score: r.score,
    }))

    // Merge and deduplicate by content
    const seen = new Set<string>()
    const merged: ExperienceResult[] = []
    for (const item of [...pgItems, ...qdrantItems]) {
      if (!seen.has(item.content)) {
        seen.add(item.content)
        merged.push(item)
      }
    }

    return merged.sort((a, b) => b.score - a.score)
  }

  // ── findEvidence ──────────────────────────────────────────────

  async findEvidence(userId: string, concept: string): Promise<EvidenceResult[]> {
    return this.graphService.findEvidence(userId, concept)
  }

  // ── searchProjects ────────────────────────────────────────────

  async searchProjects(userId: string, query: string): Promise<ProjectResult[]> {
    // Text search in Postgres
    const pgResults = await this.db
      .select()
      .from(schema.profileProjects)
      .where(
        and(
          eq(schema.profileProjects.userId, userId),
          or(
            ilike(schema.profileProjects.title, `%${query}%`),
            ilike(schema.profileProjects.description, `%${query}%`),
          ),
        ),
      )
      .limit(10)

    const pgItems: ProjectResult[] = pgResults.map((r) => ({
      source: 'pg',
      id: r.id,
      title: r.title,
      description: r.description ?? '',
      score: 1.0,
    }))

    // Qdrant semantic search
    const vector = await embed(query)
    const qdrantResults = await qdrantSearch('graph_evidence', vector, { userId, entityType: 'project' }, 5)
    const qdrantItems: ProjectResult[] = qdrantResults.map((r) => ({
      source: 'qdrant',
      id: r.id,
      title: r.payload.entityId ?? 'Project',
      description: r.payload.content,
      score: r.score,
    }))

    const seen = new Set<string>()
    const merged: ProjectResult[] = []
    for (const item of [...pgItems, ...qdrantItems]) {
      if (!seen.has(item.id)) {
        seen.add(item.id)
        merged.push(item)
      }
    }

    return merged.sort((a, b) => b.score - a.score)
  }

  // ── getCareerPatterns ─────────────────────────────────────────

  async getCareerPatterns(userId: string): Promise<CareerPatterns> {
    return this.graphService.findCareerPatterns(userId)
  }

  // ── getConversationHistory ────────────────────────────────────

  async getConversationHistory(
    userId: string,
    options?: { channel?: string; limit?: number },
  ): Promise<ConversationMessage[]> {
    const limit = options?.limit ?? 50

    const query = this.db
      .select({
        id: schema.conversationMessages.id,
        role: schema.conversationMessages.role,
        content: schema.conversationMessages.content,
        metadata: schema.conversationMessages.metadata,
        createdAt: schema.conversationMessages.createdAt,
        channel: schema.conversations.channel,
      })
      .from(schema.conversationMessages)
      .innerJoin(
        schema.conversations,
        eq(schema.conversationMessages.conversationId, schema.conversations.id),
      )
      .where(
        options?.channel
          ? and(
              eq(schema.conversations.userId, userId),
              eq(schema.conversations.channel, options.channel as typeof schema.conversations.channel._.data),
            )
          : eq(schema.conversations.userId, userId),
      )
      .orderBy(desc(schema.conversationMessages.createdAt))
      .limit(limit)

    const rows = await query
    return rows.map((r) => ({
      id: r.id,
      role: r.role,
      content: r.content,
      metadata: r.metadata,
      createdAt: r.createdAt,
      channel: r.channel,
    }))
  }

  // ── saveObservation ───────────────────────────────────────────

  async saveObservation(
    userId: string,
    agentName: string,
    observation: string,
    entityType?: string,
    entityId?: string,
  ): Promise<void> {
    try {
      const vector = await embed(observation)
      await qdrantUpsert(
        'agent_observations',
        randomUUID(),
        vector,
        {
          userId,
          entityType: entityType ?? 'observation',
          entityId: entityId ?? null,
          content: observation,
          channel: null,
          agentName,
          createdAt: new Date().toISOString(),
        },
      )
    } catch (err) {
      console.error('[MemoryService] saveObservation error:', String(err))
    }
  }

  // ── assembleContext ───────────────────────────────────────────

  async assembleContext(userId: string, workspaceCtx?: WorkspaceContext): Promise<AssembledContext> {
    // (a) Operational layer from PG
    const [profileRows, skillRows, achievementRows, workExpRows, inferenceRows] = await Promise.all([
      this.db
        .select()
        .from(schema.profiles)
        .where(eq(schema.profiles.userId, userId))
        .limit(1),
      this.db
        .select({ name: schema.skills.name })
        .from(schema.skills)
        .where(eq(schema.skills.userId, userId)),
      this.db
        .select({ id: schema.achievements.id, summary: schema.achievements.summary, skills: schema.achievements.skills })
        .from(schema.achievements)
        .where(eq(schema.achievements.userId, userId))
        .limit(20),
      this.db
        .select({ companyName: schema.workExperiences.companyName, title: schema.workExperiences.title, bullets: schema.workExperiences.bullets })
        .from(schema.workExperiences)
        .where(eq(schema.workExperiences.userId, userId))
        .orderBy(schema.workExperiences.sortOrder)
        .limit(10),
      this.db
        .select({ type: schema.graphInferences.type, label: schema.graphInferences.label, confidence: schema.graphInferences.confidence })
        .from(schema.graphInferences)
        .where(
          and(
            eq(schema.graphInferences.userId, userId),
            or(
              sql`${schema.graphInferences.expiresAt} IS NULL`,
              sql`${schema.graphInferences.expiresAt} > NOW()`,
            ),
          ),
        )
        .limit(30),
    ])

    // (b) Graph layer
    const careerPatterns = await this.graphService.findCareerPatterns(userId)

    // (c) Qdrant: last 10 conversation messages
    let recentConversation: string[] = []
    try {
      const history = await this.getConversationHistory(userId, { limit: 10 })
      recentConversation = history
        .reverse()
        .map((m) => `${m.role}: ${m.content.slice(0, 200)}`)
    } catch {
      // Degrade gracefully
    }

    // (d) Workspace-specific operational data
    let workspaceData: Record<string, unknown> = {}
    if (workspaceCtx?.entityType && workspaceCtx?.entityId) {
      workspaceData = await this.loadWorkspaceData(workspaceCtx.entityType, workspaceCtx.entityId)
    }

    return {
      profile: profileRows[0] ? (profileRows[0] as unknown as Record<string, unknown>) : null,
      skills: skillRows.map((s) => s.name),
      achievements: achievementRows.map((a) => ({
        id: a.id,
        summary: a.summary,
        skills: a.skills,
      })),
      workExperiences: workExpRows.map((w) => ({
        companyName: w.companyName,
        title: w.title,
        bullets: w.bullets,
      })),
      inferences: inferenceRows.map((i) => ({
        type: i.type,
        label: i.label,
        confidence: Number(i.confidence),
      })),
      careerPatterns,
      recentConversation,
      workspaceData,
    }
  }

  // ─────────────────────────────────────────────────────────────

  private async loadWorkspaceData(
    entityType: string,
    entityId: string,
  ): Promise<Record<string, unknown>> {
    switch (entityType) {
      case 'opportunity': {
        const [row] = await this.db
          .select()
          .from(schema.opportunities)
          .where(eq(schema.opportunities.id, entityId))
          .limit(1)
        return row ? (row as unknown as Record<string, unknown>) : {}
      }
      case 'company': {
        const [row] = await this.db
          .select()
          .from(schema.companies)
          .where(eq(schema.companies.id, entityId))
          .limit(1)
        return row ? (row as unknown as Record<string, unknown>) : {}
      }
      case 'application': {
        const [row] = await this.db
          .select()
          .from(schema.applications)
          .where(eq(schema.applications.id, entityId))
          .limit(1)
        return row ? (row as unknown as Record<string, unknown>) : {}
      }
      case 'interview': {
        const [row] = await this.db
          .select()
          .from(schema.interviews)
          .where(eq(schema.interviews.id, entityId))
          .limit(1)
        return row ? (row as unknown as Record<string, unknown>) : {}
      }
      default:
        return {}
    }
  }
}
