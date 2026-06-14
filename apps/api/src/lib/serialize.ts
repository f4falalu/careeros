import type { schema } from '../db/index.js'

type AgentTaskRow = typeof schema.agentTasks.$inferSelect
type OpportunityRow = typeof schema.opportunities.$inferSelect
type CompanyRow = typeof schema.companies.$inferSelect
type MatchScoreRow = typeof schema.matchScores.$inferSelect
type ApplicationRow = typeof schema.applications.$inferSelect

/**
 * Maps an agent_tasks row to the snake_case shape the web client expects
 * (see apps/web/src/types.ts → AgentTask). The API otherwise returns raw
 * camelCase rows; the task feed reads snake_case, so emit it consistently
 * from every place that sends a task (REST routes + the WS broadcast).
 */
export function serializeOpportunity(
  r: OpportunityRow & {
    company_name?: string | null
    company_industry?: string | null
    match_score?: {
      score: number
      missing_skills: string[]
      rationale: string | null
      computed_at: string
    } | null
  },
) {
  return {
    id: r.id,
    company_id: r.companyId,
    role_title: r.roleTitle,
    seniority: r.seniority,
    location: r.location,
    work_model: r.workModel,
    salary_text: r.salaryText,
    visa_signal: r.visaSignal,
    required_skills: r.requiredSkills ?? [],
    nice_to_haves: r.niceToHaves ?? [],
    description: r.description,
    source_url: r.sourceUrl,
    apply_url: r.applyUrl,
    source_channel: r.sourceChannel,
    created_at: r.createdAt,
    // enrichment fields (present only when requested)
    ...(r.company_name !== undefined ? { company_name: r.company_name } : {}),
    ...(r.company_industry !== undefined ? { company_industry: r.company_industry } : {}),
    ...(r.match_score !== undefined ? { match_score: r.match_score } : {}),
  }
}

export function serializeCompany(c: CompanyRow) {
  return {
    id: c.id,
    name: c.name,
    domain: c.domain,
    industry: c.industry,
    hq_location: c.hqLocation,
    size_band: c.sizeBand,
  }
}

export function serializeMatchScore(m: MatchScoreRow) {
  return {
    score: Number(m.score),
    missing_skills: m.missingSkills ?? [],
    rationale: m.rationale ?? null,
    computed_at: m.computedAt.toISOString(),
  }
}

export function serializeApplication(a: ApplicationRow) {
  return {
    id: a.id,
    opportunity_id: a.opportunityId,
    stage: a.stage,
    applied_at: a.appliedAt ?? null,
    notes: a.notes ?? undefined,
    created_at: a.createdAt,
  }
}

export function serializeAgentTask(t: AgentTaskRow) {
  return {
    id: t.id,
    agent_name: t.agentName,
    status: t.status,
    source_channel: t.sourceChannel,
    related_type: t.relatedType,
    related_id: t.relatedId,
    output: t.output,
    tools_used: t.toolsUsed ?? [],
    model_kind: t.modelKind,
    model_name: t.modelName,
    cost_usd: Number(t.costUsd ?? 0),
    error: t.error,
    created_at: t.createdAt,
    finished_at: t.finishedAt,
  }
}
