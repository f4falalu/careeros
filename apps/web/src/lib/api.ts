import type {
  AgentTask,
  AppSettings,
  Application,
  AutonomyConfig,
  BoardFilters,
  CompanyDetail,
  CompanyListItem,
  Contact,
  CoverLetter,
  Education,
  FollowUp,
  Interview,
  JobBoardSource,
  MessageState,
  MockSession,
  Opportunity,
  OpportunityDetail,
  OpportunityPage,
  OutreachMessage,
  PipelineStage,
  Profile,
  ProfileProject,
  ResumeVersion,
  Skill,
  StrategistTask,
  Vvp,
  WorkExperience,
} from '@/types'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

function getToken(): string {
  return process.env.NEXT_PUBLIC_APP_SECRET ?? ''
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { message?: string }
    throw new Error(body.message ?? `API ${res.status}`)
  }
  return res.json() as Promise<T>
}

async function reqFormData<T>(path: string, formData: FormData): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    // No Content-Type header — browser sets multipart boundary automatically
    headers: { Authorization: `Bearer ${getToken()}` },
    body: formData,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { message?: string }
    throw new Error(body.message ?? `API ${res.status}`)
  }
  return res.json() as Promise<T>
}

function qs(params?: Record<string, string | number | boolean | undefined>): string {
  if (!params) return ''
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) p.set(k, String(v))
  }
  const s = p.toString()
  return s ? `?${s}` : ''
}

export const api = {
  opportunities: {
    list: (params?: {
      stage?: string
      source?: string
      limit?: number
      work_model?: string
      q?: string
      since?: string
      with_company?: boolean
      with_match?: boolean
      cursor?: string
    }) => req<OpportunityPage>(`/opportunities${qs(params)}`),
    get: (id: string) => req<OpportunityDetail>(`/opportunities/${id}`),
    match: (id: string) => req<AgentTask>(`/opportunities/${id}/match`, { method: 'POST' }),
    resume: (id: string) => req<AgentTask>(`/opportunities/${id}/resume`, { method: 'POST' }),
    coverLetter: (id: string, tone?: string) =>
      req<AgentTask>(`/opportunities/${id}/cover-letter`, {
        method: 'POST',
        body: JSON.stringify({ tone }),
      }),
    outreach: (id: string) => req<OutreachMessage[]>(`/opportunities/${id}/outreach`),
    // Phase 4 (gated): enqueue auto-apply. Subject to Settings → Autonomy.
    apply: (id: string) => req<AgentTask>(`/opportunities/${id}/apply`, { method: 'POST' }),
  },

  applications: {
    list: (params?: { stage?: PipelineStage }) =>
      req<Application[]>(`/applications${qs(params)}`),
    create: (opportunity_id: string) =>
      req<Application>('/applications', {
        method: 'POST',
        body: JSON.stringify({ opportunity_id }),
      }),
    moveStage: (id: string, to_stage: PipelineStage, note?: string) =>
      req<Application>(`/applications/${id}/stage`, {
        method: 'PATCH',
        body: JSON.stringify({ to_stage, note }),
      }),
  },

  tasks: {
    list: (params?: { status?: string; limit?: number }) =>
      req<AgentTask[]>(`/tasks${qs(params)}`),
    get: (id: string) => req<AgentTask>(`/tasks/${id}`),
    approve: (id: string) => req<AgentTask>(`/tasks/${id}/approve`, { method: 'POST' }),
  },

  intake: {
    submit: (data: { url?: string; text?: string; source_channel: string }) =>
      req<{ opportunity: Opportunity; tasks: AgentTask[] }>('/intake', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },

  profile: {
    get: () => req<Profile>('/profile'),
    update: (data: Partial<Profile>) =>
      req<Profile>('/profile', { method: 'PUT', body: JSON.stringify(data) }),
    enhance: (data: {
      field_type: 'headline' | 'bio' | 'bullets' | 'description' | 'achievement'
      content: string
      context?: { title?: string; company?: string }
    }) => req<{ enhanced: string }>('/profile/enhance', { method: 'POST', body: JSON.stringify(data) }),
    skills: {
      list: () => req<Skill[]>('/profile/skills'),
      upsert: (data: { name: string; proficiency?: number; years?: number } | Array<{ name: string; proficiency?: number; years?: number }>) =>
        req<Skill[]>('/profile/skills', { method: 'POST', body: JSON.stringify(data) }),
      delete: (name: string) =>
        req<{ deleted: string }>(`/profile/skills/${encodeURIComponent(name)}`, { method: 'DELETE' }),
    },
    workExperiences: {
      list: () => req<WorkExperience[]>('/profile/work-experiences'),
      create: (data: Omit<WorkExperience, 'id' | 'created_at'>) =>
        req<WorkExperience>('/profile/work-experiences', { method: 'POST', body: JSON.stringify(data) }),
      update: (id: string, data: Omit<WorkExperience, 'id' | 'created_at'>) =>
        req<WorkExperience>(`/profile/work-experiences/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
      delete: (id: string) =>
        req<{ deleted: string }>(`/profile/work-experiences/${id}`, { method: 'DELETE' }),
    },
    education: {
      list: () => req<Education[]>('/profile/education'),
      create: (data: Omit<Education, 'id' | 'created_at'>) =>
        req<Education>('/profile/education', { method: 'POST', body: JSON.stringify(data) }),
      update: (id: string, data: Omit<Education, 'id' | 'created_at'>) =>
        req<Education>(`/profile/education/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
      delete: (id: string) =>
        req<{ deleted: string }>(`/profile/education/${id}`, { method: 'DELETE' }),
    },
    projects: {
      list: () => req<ProfileProject[]>('/profile/projects'),
      create: (data: Omit<ProfileProject, 'id' | 'created_at'>) =>
        req<ProfileProject>('/profile/projects', { method: 'POST', body: JSON.stringify(data) }),
      update: (id: string, data: Omit<ProfileProject, 'id' | 'created_at'>) =>
        req<ProfileProject>(`/profile/projects/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
      delete: (id: string) =>
        req<{ deleted: string }>(`/profile/projects/${id}`, { method: 'DELETE' }),
    },
  },

  resumeImport: {
    upload: (file: File) => {
      const fd = new FormData()
      fd.append('file', file)
      return reqFormData<{ taskId: string }>('/profile/resume-import', fd)
    },
    apply: (taskId: string) =>
      req<{ applied: boolean; counts: { workExperiences: number; education: number; skills: number; projects: number } }>(
        '/profile/resume-import/apply',
        { method: 'POST', body: JSON.stringify({ task_id: taskId }) },
      ),
  },

  resumes: {
    get: (id: string) => req<ResumeVersion>(`/resumes/${id}`),
    listByOpportunity: (opportunityId: string) =>
      req<ResumeVersion[]>(`/opportunities/${opportunityId}/resume-versions`),
    pdfUrl: (resumeVersionId: string) =>
      `${API_URL}/resume-versions/${resumeVersionId}/pdf`,
  },

  coverLetters: {
    listByOpportunity: (opportunityId: string) =>
      req<CoverLetter[]>(`/opportunities/${opportunityId}/cover-letters`),
  },

  vvp: {
    list: () => req<Vvp[]>('/vvps'),
    get: (id: string) => req<Vvp>(`/vvps/${id}`),
    listByOpportunity: (opportunityId: string) =>
      req<Vvp[]>(`/opportunities/${opportunityId}/vvps`),
    propose: (opportunityId: string) =>
      req<AgentTask>(`/opportunities/${opportunityId}/vvp/propose`, { method: 'POST' }),
    generate: (vvpId: string, angleIndex: number) =>
      req<AgentTask>(`/vvps/${vvpId}/generate`, {
        method: 'POST',
        body: JSON.stringify({ angle_index: angleIndex }),
      }),
  },

  outreach: {
    list: (state?: MessageState) =>
      req<OutreachMessage[]>(`/outreach${state ? `?state=${state}` : ''}`),
    get: (id: string) => req<OutreachMessage>(`/outreach/${id}`),
    draft: (
      opportunityId: string,
      opts?: { contact_role?: string; channel?: string; contact_id?: string },
    ) =>
      req<AgentTask>(`/opportunities/${opportunityId}/outreach`, {
        method: 'POST',
        body: JSON.stringify(opts ?? {}),
      }),
    approve: (id: string) => req<OutreachMessage>(`/outreach/${id}/approve`, { method: 'PATCH' }),
    archive: (id: string) => req<OutreachMessage>(`/outreach/${id}/archive`, { method: 'PATCH' }),
  },

  contacts: {
    list: (companyId?: string) =>
      req<Contact[]>(`/contacts${companyId ? `?company_id=${companyId}` : ''}`),
    create: (data: {
      name: string
      role?: string
      title?: string
      email?: string
      linkedin_url?: string
      company_id?: string
    }) => req<Contact>('/contacts', { method: 'POST', body: JSON.stringify(data) }),
    // Phase 4: compliant public-search enrichment. Subject to Settings → Autonomy.
    enrich: (id: string) => req<AgentTask>(`/contacts/${id}/enrich`, { method: 'POST' }),
  },

  jobBoards: {
    list: () => req<JobBoardSource[]>('/job-boards/sources'),
    upsert: (data: { board: string; enabled?: boolean; filters?: BoardFilters; poll_interval_minutes?: number }) =>
      req<JobBoardSource>('/job-boards/sources', { method: 'POST', body: JSON.stringify(data) }),
    patch: (id: string, data: { enabled?: boolean; filters?: BoardFilters; poll_interval_minutes?: number }) =>
      req<JobBoardSource>(`/job-boards/sources/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) => req<void>(`/job-boards/sources/${id}`, { method: 'DELETE' }),
    pollNow: (id: string) => req<{ status: string; board: string }>(`/job-boards/sources/${id}/poll`, { method: 'POST' }),
    // Phase 4 (gated): scrape a careers page. Subject to Settings → Autonomy.
    scrape: (url: string) =>
      req<AgentTask>('/job-boards/scrape', { method: 'POST', body: JSON.stringify({ url }) }),
  },

  companies: {
    list: () => req<CompanyListItem[]>('/companies'),
    get: (id: string) => req<CompanyDetail>(`/companies/${id}`),
    requestBrief: (id: string) => req<AgentTask>(`/companies/${id}/brief`, { method: 'POST' }),
  },

  interviews: {
    list: () => req<Interview[]>('/interviews'),
    get: (id: string) => req<Interview>(`/interviews/${id}`),
    getByApplication: (applicationId: string) =>
      req<Interview | null>(`/applications/${applicationId}/interview`),
    generateBrief: (applicationId: string) =>
      req<AgentTask>(`/applications/${applicationId}/interview-brief`, { method: 'POST' }),
    mock: (interviewId: string, question: string, sessionId?: string) =>
      req<AgentTask>(`/interviews/${interviewId}/mock`, {
        method: 'POST',
        body: JSON.stringify({ question, session_id: sessionId }),
      }),
    listSessions: (interviewId: string) =>
      req<MockSession[]>(`/interviews/${interviewId}/mock-sessions`),
  },

  followups: {
    generate: (outreachId: string) =>
      req<AgentTask>(`/outreach/${outreachId}/followups`, { method: 'POST' }),
    list: (outreachId: string) => req<FollowUp[]>(`/outreach/${outreachId}/followups`),
    approve: (followUpId: string) =>
      req<FollowUp>(`/followups/${followUpId}/approve`, { method: 'PATCH' }),
  },

  graph: {
    subgraph: (params?: { root?: string; depth?: number }) =>
      req<{ nodes: KGNode[]; edges: KGEdge[]; total: number }>(`/graph/subgraph${qs(params)}`),
    node: (id: string) =>
      req<{ node: KGNode; edges: KGEdge[]; inferences: KGInference[] }>(`/graph/node/${id}`),
    paths: (from: string, to: string) =>
      req<{ path: string[] }>(`/graph/paths?from=${from}&to=${to}`),
    gaps: (opportunityId: string) =>
      req<string[]>(`/graph/gaps?opportunityId=${encodeURIComponent(opportunityId)}`),
    inferences: () =>
      req<Record<string, KGInference[]>>('/graph/inferences'),
    infer: () =>
      req<Record<string, KGInference[]>>('/graph/infer', { method: 'POST' }),
    enrich: (data: unknown) =>
      req<void>('/graph/enrich', { method: 'POST', body: JSON.stringify(data) }),
  },

  strategist: {
    analyze: () => req<AgentTask>('/strategist/analyze', { method: 'POST' }),
    latest: () => req<StrategistTask | null>('/strategist/latest'),
  },

  settings: {
    get: () => req<AppSettings>('/settings'),
    update: (data: { autonomy?: AutonomyConfig }) =>
      req<AppSettings>('/settings', { method: 'PATCH', body: JSON.stringify(data) }),

    providers: {
      list: () => req<ProviderConfig[]>('/settings/providers'),
      save: (data: {
        provider: ProviderName
        api_key?: string
        base_url?: string
        default_model?: string
        enabled?: boolean
      }) => req<ProviderConfig>('/settings/providers', { method: 'POST', body: JSON.stringify(data) }),
      remove: (id: string) => req<void>(`/settings/providers/${id}`, { method: 'DELETE' }),
      test: (id: string) => req<{ ok: boolean; latency_ms: number | null; detail: string }>(`/settings/providers/${id}/test`, { method: 'POST' }),
    },

    agentRouting: {
      get: () => req<AgentRoutingConfig>('/settings/agent-routing'),
      save: (data: { defaultProvider?: ProviderName; agentRoutes?: Record<string, AgentRoute> }) =>
        req<AgentRoutingConfig>('/settings/agent-routing', { method: 'PUT', body: JSON.stringify(data) }),
    },

    models: {
      list: (provider: ProviderName) => req<{ provider: string; models: ModelOption[] }>(`/settings/models?provider=${provider}`),
    },

    channels: {
      list: () =>
        req<Array<{ channel: string; status: string; connected_as: string | null }>>('/settings/channels'),
      connect: (channel: string) =>
        req<{ channel: string; deep_link: string; expires_at: string }>(
          `/settings/channels/${channel}/connect`,
          { method: 'POST' },
        ),
      disconnect: (channel: string) =>
        req<void>(`/settings/channels/${channel}/disconnect`, { method: 'POST' }),
    },
  },
}

// ─── Settings types ──────────────────────────────────────────

export type ProviderName = 'openrouter' | 'anthropic' | 'openai' | 'groq' | 'gemini' | 'ollama'

export interface ProviderConfig {
  id: string
  provider: ProviderName
  base_url: string | null
  default_model: string | null
  enabled: boolean
  key_last4: string | null
  status: 'connected' | 'disconnected'
}

export interface AgentRoute {
  provider: ProviderName
  model: string
}

export interface AgentRoutingConfig {
  defaultProvider: ProviderName | null
  agentRoutes: Record<string, AgentRoute>
  systemRecommended: Record<string, AgentRoute>
}

export interface ModelOption {
  id: string
  name: string
  context_length?: number
  pricing?: { prompt: string; completion: string }
}

// ─── Knowledge Graph types ────────────────────────────────────

export interface KGNode {
  id: string
  type: string
  entityId?: string | null
  label: string
  metadata: Record<string, unknown>
}

export interface KGEdge {
  id: string
  source: string
  target: string
  relationship: string
  confidence: number
  evidence: unknown[]
}

export interface KGInference {
  id: string
  type: string
  label: string
  confidence: number
  evidence: unknown
  computedAt?: string
  expiresAt?: string | null
}
