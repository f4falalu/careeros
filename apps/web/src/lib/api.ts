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
  ResumeVersion,
  StrategistTask,
  Vvp,
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

function qs(params?: Record<string, string | number | undefined>): string {
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
    list: (params?: { stage?: string; source?: string; limit?: number }) =>
      req<OpportunityPage>(`/opportunities${qs(params)}`),
    get: (id: string) => req<OpportunityDetail>(`/opportunities/${id}`),
    match: (id: string) => req<AgentTask>(`/opportunities/${id}/match`, { method: 'POST' }),
    resume: (id: string) => req<AgentTask>(`/opportunities/${id}/resume`, { method: 'POST' }),
    coverLetter: (id: string, tone?: string) =>
      req<AgentTask>(`/opportunities/${id}/cover-letter`, {
        method: 'POST',
        body: JSON.stringify({ tone }),
      }),
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

  strategist: {
    analyze: () => req<AgentTask>('/strategist/analyze', { method: 'POST' }),
    latest: () => req<StrategistTask | null>('/strategist/latest'),
  },

  settings: {
    get: () => req<AppSettings>('/settings'),
    update: (data: { autonomy?: AutonomyConfig }) =>
      req<AppSettings>('/settings', { method: 'PATCH', body: JSON.stringify(data) }),
    channels: {
      list: () =>
        req<Array<{ channel: string; enabled: boolean; status: string; config: Record<string, unknown> }>>('/settings/channels'),
      saveTelegram: (data: { token?: string; allowed_user_ids?: string[]; enabled?: boolean }) =>
        req<{ channel: string; enabled: boolean; status: string; config: Record<string, unknown> }>(
          '/settings/channels/telegram',
          { method: 'PUT', body: JSON.stringify(data) },
        ),
    },
  },
}
