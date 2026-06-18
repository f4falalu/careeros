export type SourceChannel = 'telegram' | 'whatsapp' | 'web' | 'manual' | 'job_board'
export type PipelineStage = 'saved' | 'applied' | 'assessment' | 'interview' | 'final' | 'offer' | 'rejected' | 'withdrawn'
export type AgentStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'needs_approval' | 'cancelled'
export type ModelKind = 'local' | 'cloud'
export type WorkModel = 'remote' | 'hybrid' | 'onsite' | 'unknown'

export interface Company {
  id: string
  name: string
  domain?: string
  industry?: string
  hq_location?: string
  size_band?: string
}

export interface CompanyBrief {
  id: string
  company_id: string
  content: {
    business_model?: string | null
    products: string[]
    funding?: string | null
    competitors: string[]
    leadership: string[]
    recent_news: string[]
    culture_signals: string[]
    hiring_signals: string[]
  }
  sources: Array<{ title: string; url: string }>
  fetched_at: string
  is_stale: boolean
}

export interface CompanyDetail extends Company {
  latest_brief?: CompanyBrief | null
}

export interface CompanyListItem extends Company {
  opportunity_count: number
  has_brief: boolean
  created_at: string
}

export interface Opportunity {
  id: string
  company_id?: string
  role_title: string
  seniority?: string
  location?: string
  work_model?: WorkModel
  salary_text?: string
  visa_signal?: string
  required_skills: string[]
  nice_to_haves: string[]
  description?: string
  source_url?: string
  apply_url?: string
  source_channel: SourceChannel
  created_at: string
  // enriched by with_company / with_match
  company_name?: string | null
  company_industry?: string | null
  match_score?: { score: number; missing_skills: string[]; rationale: string | null; computed_at: string } | null
}

export interface MatchScore {
  score: number
  missing_skills: string[]
  rationale: string
  computed_at: string
}

export interface OpportunityDetail extends Opportunity {
  company?: Company | null
  match?: MatchScore | null
  application?: Application | null
}

export interface OpportunityPage {
  items: Opportunity[]
  next_cursor: string | null
}

// ── Job Targets (intent layer) ────────────────────────────────
export type FitTier = 'on_target' | 'unconfirmed' | 'adjacent'
export type TargetStatus = 'active' | 'paused'

export interface TargetLocks {
  location?: boolean
  work_model?: boolean
  seniority?: boolean
  min_salary?: boolean
}

export interface JobTarget {
  id: string
  label: string
  role_titles: string[]
  keywords: string[]
  seniority: string[]
  locations: string[]
  work_models: WorkModel[]
  min_salary: number | null
  locks: TargetLocks
  status: TargetStatus
  created_at: string
  updated_at: string
  opportunity_count?: number // present on list responses
}

// An opportunity enriched with its link to a target (recommendations / target detail).
export interface TargetedOpportunity extends Opportunity {
  fit_tier: FitTier
  capability_score: number | null
  is_adjacent: boolean
}

export interface TargetTiers {
  on_target: TargetedOpportunity[]
  adjacent: TargetedOpportunity[]
  unconfirmed: TargetedOpportunity[]
}

export interface JobTargetDetail extends JobTarget {
  tiers: TargetTiers
  count: number
}

export interface JobTargetRecommendations {
  targets: (JobTarget & { tiers: TargetTiers; count: number })[]
  untargeted: Opportunity[]
  totals: { matched: number; untargeted: number }
}

export interface CreateJobTargetInput {
  label: string
  role_titles?: string[]
  keywords?: string[]
  seniority?: string[]
  locations?: string[]
  work_models?: WorkModel[]
  min_salary?: number | null
  locks?: TargetLocks
  status?: TargetStatus
}

export interface Application {
  id: string
  opportunity_id: string
  stage: PipelineStage
  applied_at?: string | null
  notes?: string
  created_at: string
}

export interface AgentTask {
  id: string
  agent_name: string
  status: AgentStatus
  source_channel: SourceChannel
  related_type?: string | null
  related_id?: string | null
  output?: Record<string, unknown> | null
  tools_used: string[]
  model_kind: ModelKind
  model_name: string
  cost_usd: number
  error?: string | null
  created_at: string
  finished_at?: string | null
}

export interface ResumeVersion {
  id: string
  opportunity_id: string
  label: string
  content: Record<string, unknown>
  pdf_url?: string
  ats_score?: number
  validated: boolean
  created_at: string
}

export interface CoverLetter {
  id: string
  opportunity_id: string
  tone?: string | null
  body: string
  created_at: string
}

export interface Profile {
  id: string
  master_resume?: Record<string, unknown>
  tone_prefs?: Record<string, unknown>
  headline?: string | null
  bio?: string | null
  location?: string | null
  work_auth?: string | null
  languages?: string[]
  links?: Record<string, string>
  career_questions?: Record<string, string>
  career_dna?: {
    archetype?: string[]
    strengths?: string[]
    growth_areas?: string[]
    recommended_roles?: string[]
  }
  updated_at: string
}

export interface Skill {
  id: string
  name: string
  proficiency?: number | null
  years?: string | null
}

export interface WorkExperience {
  id: string
  company_name: string
  title: string
  employment_type?: string | null
  start_date?: string | null
  end_date?: string | null
  is_current: boolean
  location?: string | null
  bullets: string[]
  skills_extracted: string[]
  sort_order: number
  created_at: string
}

export interface Education {
  id: string
  institution: string
  degree?: string | null
  field?: string | null
  start_date?: string | null
  end_date?: string | null
  grade?: string | null
  activities: string[]
  sort_order: number
  created_at: string
}

export interface ProfileProject {
  id: string
  title: string
  description?: string | null
  role?: string | null
  tools: string[]
  outcome?: string | null
  links: string[]
  sort_order: number
  created_at: string
}

// ── Phase 2 types ─────────────────────────────────────────────

export type VvpKind =
  | 'audit'
  | 'growth_strategy'
  | 'automation'
  | 'market_analysis'
  | 'product_improvement'
  | 'analytics_dashboard'
  | 'other'

export type VvpFormat = 'report' | 'slides' | 'prototype_spec'

export interface VvpAngle {
  kind: VvpKind
  title: string
  premise: string
  why_it_lands: string
}

export interface VvpArtifact {
  title: string
  executive_summary: string
  sections: Array<{ heading: string; body: string }>
  key_recommendations: string[]
  next_steps: string[]
}

export interface Vvp {
  id: string
  opportunity_id?: string | null
  company_id?: string | null
  kind: VvpKind
  format: VvpFormat
  title: string
  content: {
    phase: 'proposal' | 'artifact'
    proposals?: VvpAngle[]
    angle?: VvpAngle
    artifact?: VvpArtifact
  }
  sources: Array<{ title: string; url: string }>
  artifact_path?: string | null
  created_at: string
}

export type MessageChannel = 'email' | 'linkedin' | 'telegram' | 'whatsapp' | 'other'
export type MessageState = 'draft' | 'approved' | 'sent' | 'replied' | 'bounced' | 'archived'
export type ContactRole = 'recruiter' | 'hiring_manager' | 'founder' | 'referral' | 'other'

export interface OutreachMessage {
  id: string
  opportunity_id?: string | null
  contact_id?: string | null
  channel: MessageChannel
  subject?: string | null
  body: string
  state: MessageState
  created_at: string
  sent_at?: string | null
}

export type BoardName = 'remotive' | 'remoteok' | 'weworkremotely'

export interface BoardFilters {
  keywords?: string[]
  category?: string
  minSalary?: number
  regions?: string[]
}

export interface JobBoardSource {
  id: string
  board: BoardName
  enabled: boolean
  filters: BoardFilters
  poll_interval_minutes: number
  last_polled_at?: string | null
}

export interface Contact {
  id: string
  company_id?: string | null
  name: string
  role: ContactRole
  title?: string | null
  email?: string | null
  linkedin_url?: string | null
  created_at: string
}

// ── Phase 3 types ─────────────────────────────────────────────

export type InterviewQuestionCategory = 'behavioral' | 'technical' | 'situational' | 'culture_fit'

export interface InterviewQuestion {
  question: string
  category: InterviewQuestionCategory
  hint: string
}

export interface StarStory {
  question_hook: string
  suggested_story: string
}

export interface InterviewBrief {
  key_themes: string[]
  likely_questions: InterviewQuestion[]
  star_stories: StarStory[]
  company_angles: string[]
  red_flags_to_address: string[]
  opening_pitch: string
}

export interface Interview {
  id: string
  user_id: string
  application_id: string
  scheduled_at?: string | null
  brief?: InterviewBrief | null
  created_at: string
}

export interface MockTurn {
  question: string
  ideal_answer: string
  coaching_tip: string
  follow_up_question?: string
  timestamp: string
}

export interface MockSession {
  id: string
  interview_id: string
  transcript: MockTurn[]
  feedback?: string | null
  created_at: string
}

export interface FollowUp {
  id: string
  outreach_id: string
  due_at: string
  drafted_body?: string | null
  state: MessageState
  created_at: string
}

export interface SkillGap {
  skill: string
  frequency: number
  priority: 'high' | 'medium' | 'low'
  suggestion: string
}

export interface StrategistReport {
  pipeline_health: {
    summary: string
    velocity_assessment: string
  }
  skill_gaps: SkillGap[]
  targeting_advice: {
    focus_roles: string[]
    avoid_patterns: string[]
    sweet_spot: string
  }
  actionable_suggestions: string[]
}

// ── Phase 4 types — autonomy control plane ────────────────────

export interface AutonomyConfig {
  autoApply: {
    enabled: boolean
    requireConfirm: boolean
    allowedSites: string[]
    dailyLimit: number
  }
  scraping: {
    enabled: boolean
    allowedDomains: string[]
  }
  crmEnrichment: {
    enabled: boolean
  }
}

export interface AppSettings {
  user_id: string
  routing: Record<string, unknown>
  inference: Record<string, unknown>
  search: Record<string, unknown>
  preferences: Record<string, unknown>
  privacy: Record<string, unknown>
  autonomy: AutonomyConfig | Record<string, never>
  updated_at: string
}

export interface StrategistTask extends AgentTask {
  output: {
    report: StrategistReport
    meta: {
      applicationsCount: number
      stageDist: Record<string, number>
      avgMatchScore: number | null
      skillGapsAnalyzed: number
    }
  } | null
}
