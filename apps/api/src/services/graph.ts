import { and, eq, inArray, sql, gt, or, isNull } from 'drizzle-orm'
import type { DB } from '../db/index.js'
import { schema } from '../db/index.js'
import { complete } from '../router/modelRouter.js'

// ─────────────────────────────────────────────────────────────
// Shared types
// ─────────────────────────────────────────────────────────────

export interface SubgraphNode {
  id: string
  type: string
  entityId: string | null
  label: string
  metadata: Record<string, unknown>
}

export interface SubgraphEdge {
  id: string
  source: string
  target: string
  relationship: string
  confidence: number
  evidence: unknown[]
}

export interface SubgraphResult {
  nodes: SubgraphNode[]
  edges: SubgraphEdge[]
  total: number
}

export interface NodeDetailResult {
  node: SubgraphNode
  edges: SubgraphEdge[]
  inferences: Array<{
    id: string
    type: string
    label: string
    confidence: number
    evidence: unknown
  }>
}

export interface EvidenceResult {
  sourceNodeId: string
  sourceNodeLabel: string
  targetNodeId: string
  targetNodeLabel: string
  relationship: string
  evidence: unknown[]
  confidence: number
}

export interface CareerPatterns {
  industries: string[]
  roles: string[]
  strengths: string[]
  progressionSignals: string[]
}

export interface SkillRelationships {
  skillNode: { id: string; label: string; attributes: unknown }
  connectedNodes: Array<{ id: string; label: string; type: string; relationship: string }>
  evidence: unknown[]
}

export interface RankedOpportunity {
  opportunityId: string
  roleTitle: string
  score: number
  rationale: string
}

export interface CareerMove {
  roleType: string
  rationale: string
  supportingThemes: string[]
  confidence: number
}

export interface NodeUpsert {
  type: string
  entityId?: string | null
  label: string
  attributes?: Record<string, unknown>
}

export interface EdgeUpsert {
  fromNodeType: string
  fromEntityId?: string | null
  fromLabel: string
  toNodeType: string
  toEntityId?: string | null
  toLabel: string
  relationship: string
  evidence?: unknown[]
  confidence?: number
}

export interface GraphEnrichment {
  nodes: NodeUpsert[]
  edges: EdgeUpsert[]
}

// ─────────────────────────────────────────────────────────────
// GraphService
// ─────────────────────────────────────────────────────────────

export class GraphService {
  constructor(private db: DB) {}

  // ── Node helpers ──────────────────────────────────────────────

  private async upsertNode(
    userId: string,
    node: NodeUpsert,
  ): Promise<string> {
    const existingRows = await this.db
      .select({ id: schema.graphNodes.id })
      .from(schema.graphNodes)
      .where(
        and(
          eq(schema.graphNodes.userId, userId),
          eq(schema.graphNodes.type, node.type as typeof schema.graphNodes.type._.data),
          node.entityId
            ? eq(schema.graphNodes.entityId, node.entityId)
            : and(isNull(schema.graphNodes.entityId), eq(schema.graphNodes.label, node.label)),
        ),
      )
      .limit(1)

    if (existingRows.length > 0) {
      return existingRows[0].id
    }

    const [inserted] = await this.db
      .insert(schema.graphNodes)
      .values({
        userId,
        type: node.type as typeof schema.graphNodes.type._.data,
        entityId: node.entityId ?? null,
        label: node.label,
        attributes: (node.attributes ?? {}) as Record<string, unknown>,
      })
      .returning({ id: schema.graphNodes.id })

    return inserted.id
  }

  // ── findEvidence ──────────────────────────────────────────────

  async findEvidence(userId: string, concept: string): Promise<EvidenceResult[]> {
    const edges = await this.db
      .select({
        id: schema.graphEdges.id,
        fromNodeId: schema.graphEdges.fromNodeId,
        toNodeId: schema.graphEdges.toNodeId,
        relationship: schema.graphEdges.relationship,
        evidence: schema.graphEdges.evidence,
        confidence: schema.graphEdges.confidence,
      })
      .from(schema.graphEdges)
      .where(
        and(
          eq(schema.graphEdges.userId, userId),
          eq(schema.graphEdges.relationship, 'DEMONSTRATES'),
        ),
      )

    if (edges.length === 0) return []

    const toNodeIds = edges.map((e) => e.toNodeId)
    const targetNodes = await this.db
      .select({ id: schema.graphNodes.id, label: schema.graphNodes.label })
      .from(schema.graphNodes)
      .where(
        and(
          inArray(schema.graphNodes.id, toNodeIds),
          sql`lower(${schema.graphNodes.label}) like ${'%' + concept.toLowerCase() + '%'}`,
        ),
      )

    if (targetNodes.length === 0) return []

    const matchingNodeIds = new Set(targetNodes.map((n) => n.id))
    const nodeLabels = new Map(targetNodes.map((n) => [n.id, n.label]))

    const matchingEdges = edges.filter((e) => matchingNodeIds.has(e.toNodeId))
    if (matchingEdges.length === 0) return []

    const fromNodeIds = matchingEdges.map((e) => e.fromNodeId)
    const fromNodes = await this.db
      .select({ id: schema.graphNodes.id, label: schema.graphNodes.label })
      .from(schema.graphNodes)
      .where(inArray(schema.graphNodes.id, fromNodeIds))

    const fromLabels = new Map(fromNodes.map((n) => [n.id, n.label]))

    return matchingEdges.map((e) => ({
      sourceNodeId: e.fromNodeId,
      sourceNodeLabel: fromLabels.get(e.fromNodeId) ?? '',
      targetNodeId: e.toNodeId,
      targetNodeLabel: nodeLabels.get(e.toNodeId) ?? '',
      relationship: e.relationship,
      evidence: (e.evidence as unknown[]) ?? [],
      confidence: Number(e.confidence),
    }))
  }

  // ── findCareerPatterns ────────────────────────────────────────

  async findCareerPatterns(userId: string): Promise<CareerPatterns> {
    const [strengthInfs, interestInfs, themeInfs] = await Promise.all([
      this.db
        .select({ label: schema.graphInferences.label })
        .from(schema.graphInferences)
        .where(
          and(
            eq(schema.graphInferences.userId, userId),
            eq(schema.graphInferences.type, 'strength'),
            or(isNull(schema.graphInferences.expiresAt), gt(schema.graphInferences.expiresAt, new Date())),
          ),
        )
        .limit(20),
      this.db
        .select({ label: schema.graphInferences.label })
        .from(schema.graphInferences)
        .where(
          and(
            eq(schema.graphInferences.userId, userId),
            eq(schema.graphInferences.type, 'interest'),
            or(isNull(schema.graphInferences.expiresAt), gt(schema.graphInferences.expiresAt, new Date())),
          ),
        )
        .limit(20),
      this.db
        .select({ label: schema.graphInferences.label })
        .from(schema.graphInferences)
        .where(
          and(
            eq(schema.graphInferences.userId, userId),
            eq(schema.graphInferences.type, 'theme'),
            or(isNull(schema.graphInferences.expiresAt), gt(schema.graphInferences.expiresAt, new Date())),
          ),
        )
        .limit(10),
    ])

    // Derive roles from experience nodes
    const experienceNodes = await this.db
      .select({ label: schema.graphNodes.label })
      .from(schema.graphNodes)
      .where(and(eq(schema.graphNodes.userId, userId), eq(schema.graphNodes.type, 'experience')))
      .limit(20)

    // Derive industries from company node attributes
    const companyNodes = await this.db
      .select({ attributes: schema.graphNodes.attributes })
      .from(schema.graphNodes)
      .where(and(eq(schema.graphNodes.userId, userId), eq(schema.graphNodes.type, 'company')))
      .limit(20)

    const industries = companyNodes
      .map((n) => (n.attributes as Record<string, unknown>)?.industry as string)
      .filter(Boolean)

    return {
      industries: [...new Set(industries)],
      roles: experienceNodes.map((n) => n.label).slice(0, 10),
      strengths: strengthInfs.map((i) => i.label),
      progressionSignals: themeInfs.map((i) => i.label),
    }
  }

  // ── findSkillRelationships ────────────────────────────────────

  async findSkillRelationships(userId: string, skill: string): Promise<SkillRelationships> {
    const [skillNode] = await this.db
      .select()
      .from(schema.graphNodes)
      .where(
        and(
          eq(schema.graphNodes.userId, userId),
          eq(schema.graphNodes.type, 'skill'),
          sql`lower(${schema.graphNodes.label}) = ${skill.toLowerCase()}`,
        ),
      )
      .limit(1)

    if (!skillNode) {
      return { skillNode: { id: '', label: skill, attributes: {} }, connectedNodes: [], evidence: [] }
    }

    const edges = await this.db
      .select()
      .from(schema.graphEdges)
      .where(
        and(
          eq(schema.graphEdges.userId, userId),
          or(eq(schema.graphEdges.fromNodeId, skillNode.id), eq(schema.graphEdges.toNodeId, skillNode.id)),
        ),
      )

    const connectedNodeIds = edges.map((e) =>
      e.fromNodeId === skillNode.id ? e.toNodeId : e.fromNodeId,
    )

    const connectedNodes =
      connectedNodeIds.length > 0
        ? await this.db
            .select()
            .from(schema.graphNodes)
            .where(inArray(schema.graphNodes.id, connectedNodeIds))
        : []

    const nodeMap = new Map(connectedNodes.map((n) => [n.id, n]))

    return {
      skillNode: { id: skillNode.id, label: skillNode.label, attributes: skillNode.attributes },
      connectedNodes: edges.map((e) => {
        const otherId = e.fromNodeId === skillNode.id ? e.toNodeId : e.fromNodeId
        const other = nodeMap.get(otherId)
        return {
          id: otherId,
          label: other?.label ?? '',
          type: other?.type ?? '',
          relationship: e.relationship,
        }
      }),
      evidence: edges.flatMap((e) => (e.evidence as unknown[]) ?? []),
    }
  }

  // ── findMissingCapabilities ───────────────────────────────────

  async findMissingCapabilities(userId: string, opportunityId: string): Promise<string[]> {
    const [opportunity] = await this.db
      .select({ requiredSkills: schema.opportunities.requiredSkills })
      .from(schema.opportunities)
      .where(eq(schema.opportunities.id, opportunityId))
      .limit(1)

    if (!opportunity) return []

    const required = (opportunity.requiredSkills ?? []).map((s) => s.toLowerCase())
    if (required.length === 0) return []

    // HAS_SKILL edges — find which skills the user demonstrably has
    const hasSkillEdges = await this.db
      .select({ toNodeId: schema.graphEdges.toNodeId, confidence: schema.graphEdges.confidence })
      .from(schema.graphEdges)
      .where(
        and(eq(schema.graphEdges.userId, userId), eq(schema.graphEdges.relationship, 'HAS_SKILL')),
      )

    const hasSkillNodeIds = hasSkillEdges
      .filter((e) => Number(e.confidence) >= 0.5)
      .map((e) => e.toNodeId)

    if (hasSkillNodeIds.length === 0) return required

    const userSkillNodes = await this.db
      .select({ label: schema.graphNodes.label })
      .from(schema.graphNodes)
      .where(inArray(schema.graphNodes.id, hasSkillNodeIds))

    const userSkills = new Set(userSkillNodes.map((n) => n.label.toLowerCase()))
    return required.filter((s) => !userSkills.has(s))
  }

  // ── recommendOpportunities ────────────────────────────────────

  async recommendOpportunities(userId: string): Promise<RankedOpportunity[]> {
    const patterns = await this.findCareerPatterns(userId)
    const strengthSet = new Set(patterns.strengths.map((s) => s.toLowerCase()))

    // Find opportunities not yet applied to
    const appliedOppIds = await this.db
      .select({ opportunityId: schema.applications.opportunityId })
      .from(schema.applications)
      .where(eq(schema.applications.userId, userId))

    const appliedSet = new Set(appliedOppIds.map((r) => r.opportunityId))

    const opportunities = await this.db
      .select({
        id: schema.opportunities.id,
        roleTitle: schema.opportunities.roleTitle,
        requiredSkills: schema.opportunities.requiredSkills,
      })
      .from(schema.opportunities)
      .where(eq(schema.opportunities.userId, userId))
      .limit(100)

    const ranked: RankedOpportunity[] = opportunities
      .filter((o) => !appliedSet.has(o.id))
      .map((o) => {
        const required = (o.requiredSkills ?? []).map((s) => s.toLowerCase())
        const matched = required.filter((s) => strengthSet.has(s))
        const score = required.length > 0 ? Math.round((matched.length / required.length) * 100) : 50
        return {
          opportunityId: o.id,
          roleTitle: o.roleTitle,
          score,
          rationale: matched.length > 0
            ? `Matches ${matched.length}/${required.length} required skills based on your graph strengths`
            : 'No direct skill overlap found with your current graph',
        }
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)

    return ranked
  }

  // ── recommendCareerMoves ──────────────────────────────────────

  async recommendCareerMoves(userId: string): Promise<CareerMove[]> {
    const inferences = await this.db
      .select()
      .from(schema.graphInferences)
      .where(
        and(
          eq(schema.graphInferences.userId, userId),
          inArray(schema.graphInferences.type, ['theme', 'strength']),
          or(isNull(schema.graphInferences.expiresAt), gt(schema.graphInferences.expiresAt, new Date())),
        ),
      )
      .limit(20)

    if (inferences.length === 0) return []

    const themes = inferences.filter((i) => i.type === 'theme').map((i) => i.label)
    const strengths = inferences.filter((i) => i.type === 'strength').map((i) => i.label)

    const prompt = `Based on these career themes and strengths, suggest 3 next role moves.

Career Themes: ${themes.join(', ') || 'Not yet determined'}
Top Strengths: ${strengths.slice(0, 10).join(', ') || 'Not yet determined'}

Return a JSON array of objects: { roleType, rationale, supportingThemes, confidence }.
Respond with ONLY the JSON array.`

    try {
      const { text } = await complete(prompt, { taskType: 'strategist', containsPersonalData: false })
      const parsed = JSON.parse(text.trim().replace(/^```json?\n?/, '').replace(/\n?```$/, ''))
      if (Array.isArray(parsed)) return parsed as CareerMove[]
    } catch {
      // Fall through
    }

    return themes.slice(0, 3).map((theme) => ({
      roleType: theme,
      rationale: `Your graph shows strong signal in ${theme}`,
      supportingThemes: [theme],
      confidence: 0.6,
    }))
  }

  // ── inferStrengths ────────────────────────────────────────────

  async inferStrengths(userId: string): Promise<void> {
    const demonstratesEdges = await this.db
      .select({ toNodeId: schema.graphEdges.toNodeId })
      .from(schema.graphEdges)
      .where(
        and(eq(schema.graphEdges.userId, userId), eq(schema.graphEdges.relationship, 'DEMONSTRATES')),
      )

    if (demonstratesEdges.length === 0) return

    const countMap = new Map<string, number>()
    for (const e of demonstratesEdges) {
      countMap.set(e.toNodeId, (countMap.get(e.toNodeId) ?? 0) + 1)
    }

    const maxCount = Math.max(...countMap.values())
    const nodeIds = [...countMap.keys()]

    const nodes = await this.db
      .select({ id: schema.graphNodes.id, label: schema.graphNodes.label })
      .from(schema.graphNodes)
      .where(inArray(schema.graphNodes.id, nodeIds))

    const nodeLabels = new Map(nodes.map((n) => [n.id, n.label]))
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

    for (const [nodeId, count] of countMap.entries()) {
      const label = nodeLabels.get(nodeId)
      if (!label) continue
      const confidence = maxCount > 0 ? count / maxCount : 0

      await this.upsertInference(userId, 'strength', label, confidence, { nodeId, count }, expiresAt)
    }
  }

  // ── inferWeaknesses ───────────────────────────────────────────

  async inferWeaknesses(userId: string): Promise<void> {
    const requiresEdges = await this.db
      .select({ toNodeId: schema.graphEdges.toNodeId })
      .from(schema.graphEdges)
      .where(
        and(eq(schema.graphEdges.userId, userId), eq(schema.graphEdges.relationship, 'REQUIRES')),
      )

    if (requiresEdges.length === 0) return

    const requiredNodeIds = [...new Set(requiresEdges.map((e) => e.toNodeId))]

    const hasSkillEdges = await this.db
      .select({ toNodeId: schema.graphEdges.toNodeId, confidence: schema.graphEdges.confidence })
      .from(schema.graphEdges)
      .where(
        and(eq(schema.graphEdges.userId, userId), eq(schema.graphEdges.relationship, 'HAS_SKILL')),
      )

    const coveredNodeIds = new Set(
      hasSkillEdges.filter((e) => Number(e.confidence) >= 0.5).map((e) => e.toNodeId),
    )

    const gapNodeIds = requiredNodeIds.filter((id) => !coveredNodeIds.has(id))
    if (gapNodeIds.length === 0) return

    const gapNodes = await this.db
      .select({ id: schema.graphNodes.id, label: schema.graphNodes.label })
      .from(schema.graphNodes)
      .where(inArray(schema.graphNodes.id, gapNodeIds))

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

    for (const node of gapNodes) {
      await this.upsertInference(userId, 'weakness', node.label, 0.8, { nodeId: node.id }, expiresAt)
    }
  }

  // ── inferInterests ────────────────────────────────────────────

  async inferInterests(userId: string): Promise<void> {
    const edges = await this.db
      .select({ toNodeId: schema.graphEdges.toNodeId, relationship: schema.graphEdges.relationship })
      .from(schema.graphEdges)
      .where(
        and(
          eq(schema.graphEdges.userId, userId),
          inArray(schema.graphEdges.relationship, ['APPLIED_TO', 'INTERESTED_IN']),
        ),
      )

    if (edges.length === 0) return

    const countMap = new Map<string, number>()
    for (const e of edges) {
      countMap.set(e.toNodeId, (countMap.get(e.toNodeId) ?? 0) + 1)
    }

    const nodeIds = [...countMap.keys()]
    const nodes = await this.db
      .select({ id: schema.graphNodes.id, label: schema.graphNodes.label })
      .from(schema.graphNodes)
      .where(inArray(schema.graphNodes.id, nodeIds))

    const maxCount = Math.max(...countMap.values())
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

    for (const node of nodes) {
      const count = countMap.get(node.id) ?? 0
      const confidence = maxCount > 0 ? count / maxCount : 0
      await this.upsertInference(userId, 'interest', node.label, confidence, { nodeId: node.id, count }, expiresAt)
    }
  }

  // ── inferCareerThemes ─────────────────────────────────────────

  async inferCareerThemes(userId: string): Promise<void> {
    const patterns = await this.findCareerPatterns(userId)

    if (patterns.strengths.length === 0 && patterns.industries.length === 0) return

    const prompt = `Analyze this professional's career graph and identify 3–5 career themes.

Industries: ${patterns.industries.slice(0, 8).join(', ') || 'Not determined'}
Roles: ${patterns.roles.slice(0, 8).join(', ') || 'Not determined'}
Strengths: ${patterns.strengths.slice(0, 10).join(', ') || 'Not determined'}

Return ONLY a JSON array of short theme labels (max 5 words each). Example: ["Product-Led Growth", "Healthcare AI", "Platform Engineering"]`

    try {
      const { text } = await complete(prompt, { taskType: 'strategist', containsPersonalData: false })
      const cleaned = text.trim().replace(/^```json?\n?/, '').replace(/\n?```$/, '')
      const themes = JSON.parse(cleaned) as string[]
      if (!Array.isArray(themes)) return

      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      for (const theme of themes.slice(0, 5)) {
        if (typeof theme === 'string' && theme.trim()) {
          await this.upsertInference(userId, 'theme', theme.trim(), 0.8, { source: 'llm' }, expiresAt)
        }
      }
    } catch (err) {
      console.error('[GraphService] inferCareerThemes error:', String(err))
    }
  }

  // ── getInferences ─────────────────────────────────────────────

  async getInferences(userId: string): Promise<Record<string, Array<{
    id: string
    label: string
    confidence: number
    evidence: unknown
    computedAt: Date
    expiresAt: Date | null
  }>>> {
    const rows = await this.db
      .select()
      .from(schema.graphInferences)
      .where(
        and(
          eq(schema.graphInferences.userId, userId),
          or(isNull(schema.graphInferences.expiresAt), gt(schema.graphInferences.expiresAt, new Date())),
        ),
      )

    const grouped: Record<string, Array<{
      id: string
      label: string
      confidence: number
      evidence: unknown
      computedAt: Date
      expiresAt: Date | null
    }>> = {}
    for (const row of rows) {
      grouped[row.type] = grouped[row.type] ?? []
      grouped[row.type].push({
        id: row.id,
        label: row.label,
        confidence: Number(row.confidence),
        evidence: row.evidence,
        computedAt: row.computedAt,
        expiresAt: row.expiresAt,
      })
    }
    return grouped
  }

  // ── enrich ────────────────────────────────────────────────────

  async enrich(userId: string, enrichment: GraphEnrichment): Promise<void> {
    // Upsert nodes first, collect id map
    const nodeIdMap = new Map<string, string>()

    for (const node of enrichment.nodes) {
      const key = `${node.type}:${node.entityId ?? node.label}`
      const id = await this.upsertNode(userId, node)
      nodeIdMap.set(key, id)
    }

    // Upsert edges
    for (const edge of enrichment.edges) {
      const fromKey = `${edge.fromNodeType}:${edge.fromEntityId ?? edge.fromLabel}`
      const toKey = `${edge.toNodeType}:${edge.toEntityId ?? edge.toLabel}`

      // Ensure from/to nodes exist
      let fromId = nodeIdMap.get(fromKey)
      if (!fromId) {
        fromId = await this.upsertNode(userId, {
          type: edge.fromNodeType,
          entityId: edge.fromEntityId,
          label: edge.fromLabel,
        })
        nodeIdMap.set(fromKey, fromId)
      }

      let toId = nodeIdMap.get(toKey)
      if (!toId) {
        toId = await this.upsertNode(userId, {
          type: edge.toNodeType,
          entityId: edge.toEntityId,
          label: edge.toLabel,
        })
        nodeIdMap.set(toKey, toId)
      }

      // Check if edge already exists
      const [existing] = await this.db
        .select({ id: schema.graphEdges.id, evidence: schema.graphEdges.evidence })
        .from(schema.graphEdges)
        .where(
          and(
            eq(schema.graphEdges.userId, userId),
            eq(schema.graphEdges.fromNodeId, fromId),
            eq(schema.graphEdges.toNodeId, toId),
            eq(schema.graphEdges.relationship, edge.relationship),
          ),
        )
        .limit(1)

      if (existing) {
        // Merge evidence arrays, deduplicate by 'source' field
        const existingEvidence = (existing.evidence as Array<Record<string, unknown>>) ?? []
        const newEvidence = (edge.evidence ?? []) as Array<Record<string, unknown>>
        const existingSources = new Set(existingEvidence.map((e) => e.source).filter(Boolean))
        const toAdd = newEvidence.filter((e) => !e.source || !existingSources.has(e.source))
        const merged = [...existingEvidence, ...toAdd]

        await this.db
          .update(schema.graphEdges)
          .set({
            evidence: merged as unknown as Record<string, unknown>[],
            confidence: String(edge.confidence ?? 1.0),
            updatedAt: new Date(),
          })
          .where(eq(schema.graphEdges.id, existing.id))
      } else {
        await this.db.insert(schema.graphEdges).values({
          userId,
          fromNodeId: fromId,
          toNodeId: toId,
          relationship: edge.relationship,
          evidence: (edge.evidence ?? []) as unknown as Record<string, unknown>[],
          confidence: String(edge.confidence ?? 1.0),
        })
      }
    }
  }

  // ── getSubgraph ───────────────────────────────────────────────

  async getSubgraph(userId: string, rootNodeId: string | null, depth: number): Promise<SubgraphResult> {
    const NODE_CAP = 50

    // Resolve root node
    let rootId = rootNodeId
    if (!rootId) {
      const [userNode] = await this.db
        .select({ id: schema.graphNodes.id })
        .from(schema.graphNodes)
        .where(and(eq(schema.graphNodes.userId, userId), eq(schema.graphNodes.type, 'user')))
        .limit(1)
      if (!userNode) return { nodes: [], edges: [], total: 0 }
      rootId = userNode.id
    }

    const visitedNodeIds = new Set<string>()
    const collectedEdges: SubgraphEdge[] = []
    const collectedNodes: SubgraphNode[] = []
    const frontier = [rootId]

    // Fetch root node
    const [rootRow] = await this.db
      .select()
      .from(schema.graphNodes)
      .where(and(eq(schema.graphNodes.userId, userId), eq(schema.graphNodes.id, rootId)))
      .limit(1)

    if (!rootRow) return { nodes: [], edges: [], total: 0 }

    visitedNodeIds.add(rootId)
    collectedNodes.push({
      id: rootRow.id,
      type: rootRow.type,
      entityId: rootRow.entityId ?? null,
      label: rootRow.label,
      metadata: (rootRow.attributes ?? {}) as Record<string, unknown>,
    })

    for (let d = 0; d < depth && frontier.length > 0; d++) {
      const currentFrontier = [...frontier]
      frontier.length = 0

      // Fetch all edges touching any frontier node
      const edges = await this.db
        .select()
        .from(schema.graphEdges)
        .where(
          and(
            eq(schema.graphEdges.userId, userId),
            or(
              inArray(schema.graphEdges.fromNodeId, currentFrontier),
              inArray(schema.graphEdges.toNodeId, currentFrontier),
            ),
          ),
        )

      const newNodeIds: string[] = []
      for (const e of edges) {
        // Add edge if not already collected
        if (!collectedEdges.find((ce) => ce.id === e.id)) {
          collectedEdges.push({
            id: e.id,
            source: e.fromNodeId,
            target: e.toNodeId,
            relationship: e.relationship,
            confidence: Number(e.confidence),
            evidence: (e.evidence as unknown[]) ?? [],
          })
        }

        // Collect unvisited neighbors
        for (const neighborId of [e.fromNodeId, e.toNodeId]) {
          if (!visitedNodeIds.has(neighborId) && collectedNodes.length < NODE_CAP) {
            visitedNodeIds.add(neighborId)
            newNodeIds.push(neighborId)
            frontier.push(neighborId)
          }
        }
      }

      if (newNodeIds.length > 0) {
        const newNodes = await this.db
          .select()
          .from(schema.graphNodes)
          .where(and(eq(schema.graphNodes.userId, userId), inArray(schema.graphNodes.id, newNodeIds)))
        for (const n of newNodes) {
          collectedNodes.push({
            id: n.id,
            type: n.type,
            entityId: n.entityId ?? null,
            label: n.label,
            metadata: (n.attributes ?? {}) as Record<string, unknown>,
          })
        }
      }

      if (collectedNodes.length >= NODE_CAP) break
    }

    return {
      nodes: collectedNodes,
      edges: collectedEdges,
      total: collectedNodes.length,
    }
  }

  // ── getNodeDetail ─────────────────────────────────────────────

  async getNodeDetail(userId: string, nodeId: string): Promise<NodeDetailResult | null> {
    const [nodeRow] = await this.db
      .select()
      .from(schema.graphNodes)
      .where(and(eq(schema.graphNodes.userId, userId), eq(schema.graphNodes.id, nodeId)))
      .limit(1)

    if (!nodeRow) return null

    const edges = await this.db
      .select()
      .from(schema.graphEdges)
      .where(
        and(
          eq(schema.graphEdges.userId, userId),
          or(eq(schema.graphEdges.fromNodeId, nodeId), eq(schema.graphEdges.toNodeId, nodeId)),
        ),
      )

    const subgraphEdges: SubgraphEdge[] = edges.map((e) => ({
      id: e.id,
      source: e.fromNodeId,
      target: e.toNodeId,
      relationship: e.relationship,
      confidence: Number(e.confidence),
      evidence: (e.evidence as unknown[]) ?? [],
    }))

    const inferences = await this.db
      .select()
      .from(schema.graphInferences)
      .where(
        and(
          eq(schema.graphInferences.userId, userId),
          or(isNull(schema.graphInferences.expiresAt), gt(schema.graphInferences.expiresAt, new Date())),
        ),
      )
      .limit(20)

    return {
      node: {
        id: nodeRow.id,
        type: nodeRow.type,
        entityId: nodeRow.entityId ?? null,
        label: nodeRow.label,
        metadata: (nodeRow.attributes ?? {}) as Record<string, unknown>,
      },
      edges: subgraphEdges,
      inferences: inferences.map((i) => ({
        id: i.id,
        type: i.type,
        label: i.label,
        confidence: Number(i.confidence),
        evidence: i.evidence,
      })),
    }
  }

  // ── findPath ──────────────────────────────────────────────────

  async findPath(userId: string, fromId: string, toId: string): Promise<string[]> {
    if (fromId === toId) return [fromId]

    // Load all edges for this user (cap at 1000 for performance)
    const edges = await this.db
      .select({
        fromNodeId: schema.graphEdges.fromNodeId,
        toNodeId: schema.graphEdges.toNodeId,
      })
      .from(schema.graphEdges)
      .where(eq(schema.graphEdges.userId, userId))
      .limit(1000)

    // Build bidirectional adjacency list
    const adj = new Map<string, string[]>()
    for (const e of edges) {
      if (!adj.has(e.fromNodeId)) adj.set(e.fromNodeId, [])
      if (!adj.has(e.toNodeId)) adj.set(e.toNodeId, [])
      adj.get(e.fromNodeId)!.push(e.toNodeId)
      adj.get(e.toNodeId)!.push(e.fromNodeId)
    }

    // BFS
    const visited = new Set<string>([fromId])
    const queue: Array<{ id: string; path: string[] }> = [{ id: fromId, path: [fromId] }]

    while (queue.length > 0) {
      const { id, path } = queue.shift()!
      const neighbors = adj.get(id) ?? []
      for (const neighbor of neighbors) {
        if (neighbor === toId) return [...path, toId]
        if (!visited.has(neighbor) && path.length < 10) {
          visited.add(neighbor)
          queue.push({ id: neighbor, path: [...path, neighbor] })
        }
      }
    }

    return []
  }

  // ── private helpers ───────────────────────────────────────────

  private async upsertInference(
    userId: string,
    type: string,
    label: string,
    confidence: number,
    evidence: Record<string, unknown>,
    expiresAt: Date,
  ): Promise<void> {
    const [existing] = await this.db
      .select({ id: schema.graphInferences.id })
      .from(schema.graphInferences)
      .where(
        and(
          eq(schema.graphInferences.userId, userId),
          eq(schema.graphInferences.type, type),
          eq(schema.graphInferences.label, label),
        ),
      )
      .limit(1)

    if (existing) {
      await this.db
        .update(schema.graphInferences)
        .set({
          confidence: String(confidence),
          evidence: evidence as Record<string, unknown>,
          computedAt: new Date(),
          expiresAt,
        })
        .where(eq(schema.graphInferences.id, existing.id))
    } else {
      await this.db.insert(schema.graphInferences).values({
        userId,
        type,
        label,
        confidence: String(confidence),
        evidence: evidence as Record<string, unknown>,
        computedAt: new Date(),
        expiresAt,
      })
    }
  }
}
