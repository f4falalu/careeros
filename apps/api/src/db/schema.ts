import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  timestamp,
  numeric,
  smallint,
  jsonb,
  integer,
  date,
  index,
  uniqueIndex,
  customType,
} from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'

// ─────────────────────────────────────────────────────────────
// Custom pgvector type
// ─────────────────────────────────────────────────────────────
const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return 'vector(768)'
  },
  toDriver(value) {
    return `[${value.join(',')}]`
  },
  fromDriver(value) {
    return (value as string).slice(1, -1).split(',').map(Number)
  },
})

// ─────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────
export const workModelEnum = pgEnum('work_model', ['remote', 'hybrid', 'onsite', 'unknown'])
export const pipelineStageEnum = pgEnum('pipeline_stage', [
  'saved',
  'applied',
  'assessment',
  'interview',
  'final',
  'offer',
  'rejected',
  'withdrawn',
])
export const assetKindEnum = pgEnum('asset_kind', [
  'resume_version',
  'cover_letter',
  'vvp',
  'interview_brief',
  'other',
])
export const contactRoleEnum = pgEnum('contact_role', [
  'recruiter',
  'hiring_manager',
  'founder',
  'referral',
  'other',
])
export const messageChannelEnum = pgEnum('message_channel', [
  'email',
  'linkedin',
  'telegram',
  'whatsapp',
  'other',
])
export const messageStateEnum = pgEnum('message_state', [
  'draft',
  'approved',
  'sent',
  'replied',
  'bounced',
  'archived',
])
export const vvpKindEnum = pgEnum('vvp_kind', [
  'audit',
  'growth_strategy',
  'automation',
  'market_analysis',
  'product_improvement',
  'analytics_dashboard',
  'other',
])
export const vvpFormatEnum = pgEnum('vvp_format', ['report', 'slides', 'prototype_spec'])
export const agentStatusEnum = pgEnum('agent_status', [
  'queued',
  'running',
  'succeeded',
  'failed',
  'needs_approval',
  'cancelled',
])
export const modelKindEnum = pgEnum('model_kind', ['local', 'cloud'])
export const sourceChannelEnum = pgEnum('source_channel', [
  'telegram',
  'whatsapp',
  'web',
  'manual',
  'job_board',
])
export const credentialKindEnum = pgEnum('credential_kind', [
  'api_key',
  'oauth_token',
  'bearer',
  'basic',
  'webhook_secret',
])

// ─────────────────────────────────────────────────────────────
// Identity
// ─────────────────────────────────────────────────────────────
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').unique(),
  displayName: text('display_name'),
  telegramUserId: text('telegram_user_id'),
  whatsappNumber: text('whatsapp_number'),
  // Phase 5 (foundation): real-auth scaffold. Nullable so the v1 single-owner
  // (bearer-token) user keeps working with no password set. The login flow
  // itself is intentionally minimal and flagged for human security review (SECURITY.md B3).
  passwordHash: text('password_hash'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// Phase 5 (foundation): session tokens for real auth. Only the SHA-256 hash of
// the opaque token is stored — never the token itself.
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('sessions_token_hash').on(t.tokenHash)],
)

export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  masterResume: jsonb('master_resume').notNull().default({}),
  tonePrefs: jsonb('tone_prefs').notNull().default({}),
  // Hero / identity fields (added migration 0002)
  headline: text('headline'),
  bio: text('bio'),
  location: text('location'),
  workAuth: text('work_auth'),
  languages: text('languages').array().default([]),
  links: jsonb('links').notNull().default({}),
  careerQuestions: jsonb('career_questions').notNull().default({}),
  careerDna: jsonb('career_dna').notNull().default({}),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const workExperiences = pgTable(
  'work_experiences',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    companyName: text('company_name').notNull(),
    title: text('title').notNull(),
    employmentType: text('employment_type'),
    startDate: date('start_date'),
    endDate: date('end_date'),
    isCurrent: boolean('is_current').notNull().default(false),
    location: text('location'),
    bullets: text('bullets').array().notNull().default([]),
    skillsExtracted: text('skills_extracted').array().notNull().default([]),
    sortOrder: smallint('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('work_experiences_user').on(t.userId, t.sortOrder)],
)

export const educations = pgTable(
  'education',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    institution: text('institution').notNull(),
    degree: text('degree'),
    field: text('field'),
    startDate: date('start_date'),
    endDate: date('end_date'),
    grade: text('grade'),
    activities: text('activities').array().notNull().default([]),
    sortOrder: smallint('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('education_user').on(t.userId, t.sortOrder)],
)

export const profileProjects = pgTable(
  'profile_projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    role: text('role'),
    tools: text('tools').array().notNull().default([]),
    outcome: text('outcome'),
    links: text('links').array().notNull().default([]),
    sortOrder: smallint('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('profile_projects_user').on(t.userId, t.sortOrder)],
)

export const achievements = pgTable('achievements', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  summary: text('summary').notNull(),
  detail: text('detail'),
  skills: text('skills').array().default([]),
  metrics: jsonb('metrics').default({}),
  embedding: vector('embedding'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const skills = pgTable(
  'skills',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    proficiency: smallint('proficiency'),
    years: numeric('years', { precision: 4, scale: 1 }),
  },
  (t) => [uniqueIndex('skills_user_name').on(t.userId, t.name)],
)

// ─────────────────────────────────────────────────────────────
// Companies & research
// ─────────────────────────────────────────────────────────────
export const companies = pgTable(
  'companies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    domain: text('domain'),
    industry: text('industry'),
    hqLocation: text('hq_location'),
    sizeBand: text('size_band'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('companies_user_name_domain').on(t.userId, t.name, t.domain)],
)

export const companyBriefs = pgTable('company_briefs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  content: jsonb('content').notNull(),
  sources: jsonb('sources').notNull().default([]),
  embedding: vector('embedding'),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  isStale: boolean('is_stale').notNull().default(false),
})

// ─────────────────────────────────────────────────────────────
// Opportunities (jobs) & pipeline
// ─────────────────────────────────────────────────────────────
export const opportunities = pgTable(
  'opportunities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'set null' }),
    roleTitle: text('role_title').notNull(),
    seniority: text('seniority'),
    location: text('location'),
    workModel: workModelEnum('work_model').default('unknown'),
    salaryText: text('salary_text'),
    visaSignal: text('visa_signal'),
    requiredSkills: text('required_skills').array().default([]),
    niceToHaves: text('nice_to_haves').array().default([]),
    description: text('description'),
    sourceUrl: text('source_url'),
    applyUrl: text('apply_url'),
    sourceChannel: sourceChannelEnum('source_channel').notNull().default('manual'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('opportunities_user').on(t.userId)],
)

export const matchScores = pgTable('match_scores', {
  id: uuid('id').primaryKey().defaultRandom(),
  opportunityId: uuid('opportunity_id')
    .notNull()
    .references(() => opportunities.id, { onDelete: 'cascade' }),
  score: numeric('score', { precision: 4, scale: 1 }).notNull(),
  missingSkills: text('missing_skills').array().default([]),
  rationale: text('rationale'),
  computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
})

export const applications = pgTable(
  'applications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    opportunityId: uuid('opportunity_id')
      .notNull()
      .references(() => opportunities.id, { onDelete: 'cascade' }),
    stage: pipelineStageEnum('stage').notNull().default('saved'),
    appliedAt: timestamp('applied_at', { withTimezone: true }),
    // Phase 4 (autonomy): true when the Apply agent submitted this application.
    // Used for the per-day auto-apply cap and for audit/UI distinction.
    autoApplied: boolean('auto_applied').notNull().default(false),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('applications_opportunity').on(t.opportunityId),
    index('applications_stage').on(t.userId, t.stage),
  ],
)

export const stageEvents = pgTable('stage_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  applicationId: uuid('application_id')
    .notNull()
    .references(() => applications.id, { onDelete: 'cascade' }),
  fromStage: pipelineStageEnum('from_stage'),
  toStage: pipelineStageEnum('to_stage').notNull(),
  actor: text('actor').notNull().default('user'),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ─────────────────────────────────────────────────────────────
// Assets
// ─────────────────────────────────────────────────────────────
export const resumeVersions = pgTable('resume_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  opportunityId: uuid('opportunity_id').references(() => opportunities.id, {
    onDelete: 'set null',
  }),
  label: text('label').notNull(),
  content: jsonb('content').notNull(),
  pdfPath: text('pdf_path'),
  atsScore: numeric('ats_score', { precision: 4, scale: 1 }),
  validated: boolean('validated').notNull().default(false),
  embedding: vector('embedding'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const coverLetters = pgTable('cover_letters', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  opportunityId: uuid('opportunity_id').references(() => opportunities.id, {
    onDelete: 'set null',
  }),
  tone: text('tone'),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const vvps = pgTable('vvps', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  opportunityId: uuid('opportunity_id').references(() => opportunities.id, {
    onDelete: 'set null',
  }),
  companyId: uuid('company_id').references(() => companies.id, { onDelete: 'set null' }),
  kind: vvpKindEnum('kind').notNull(),
  format: vvpFormatEnum('format').notNull().default('report'),
  title: text('title').notNull(),
  content: jsonb('content').notNull(),
  sources: jsonb('sources').notNull().default([]),
  artifactPath: text('artifact_path'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const assetLinks = pgTable('asset_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  applicationId: uuid('application_id')
    .notNull()
    .references(() => applications.id, { onDelete: 'cascade' }),
  kind: assetKindEnum('kind').notNull(),
  assetId: uuid('asset_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ─────────────────────────────────────────────────────────────
// Contacts, outreach, follow-ups
// ─────────────────────────────────────────────────────────────
export const contacts = pgTable('contacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  companyId: uuid('company_id').references(() => companies.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  role: contactRoleEnum('role').notNull().default('other'),
  title: text('title'),
  email: text('email'),
  linkedinUrl: text('linkedin_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const outreachMessages = pgTable('outreach_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
  opportunityId: uuid('opportunity_id').references(() => opportunities.id, {
    onDelete: 'set null',
  }),
  channel: messageChannelEnum('channel').notNull().default('email'),
  subject: text('subject'),
  body: text('body').notNull(),
  state: messageStateEnum('state').notNull().default('draft'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp('sent_at', { withTimezone: true }),
})

export const followUps = pgTable('follow_ups', {
  id: uuid('id').primaryKey().defaultRandom(),
  outreachId: uuid('outreach_id')
    .notNull()
    .references(() => outreachMessages.id, { onDelete: 'cascade' }),
  dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
  draftedBody: text('drafted_body'),
  state: messageStateEnum('state').notNull().default('draft'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ─────────────────────────────────────────────────────────────
// Interviews
// ─────────────────────────────────────────────────────────────
export const interviews = pgTable('interviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  applicationId: uuid('application_id')
    .notNull()
    .references(() => applications.id, { onDelete: 'cascade' }),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
  brief: jsonb('brief'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const mockSessions = pgTable('mock_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  interviewId: uuid('interview_id')
    .notNull()
    .references(() => interviews.id, { onDelete: 'cascade' }),
  transcript: jsonb('transcript').notNull().default([]),
  feedback: text('feedback'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ─────────────────────────────────────────────────────────────
// Agent audit log
// ─────────────────────────────────────────────────────────────
export const agentTasks = pgTable(
  'agent_tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    agentName: text('agent_name').notNull(),
    status: agentStatusEnum('status').notNull().default('queued'),
    sourceChannel: sourceChannelEnum('source_channel').notNull().default('web'),
    relatedType: text('related_type'),
    relatedId: uuid('related_id'),
    input: jsonb('input'),
    output: jsonb('output'),
    toolsUsed: text('tools_used').array().default([]),
    modelKind: modelKindEnum('model_kind'),
    modelName: text('model_name'),
    costUsd: numeric('cost_usd', { precision: 10, scale: 4 }).default('0'),
    error: text('error'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('agent_tasks_feed').on(t.userId, t.createdAt),
    index('agent_tasks_status').on(t.userId, t.status),
  ],
)

// ─────────────────────────────────────────────────────────────
// Settings & configuration
// ─────────────────────────────────────────────────────────────
export const credentials = pgTable(
  'credentials',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    kind: credentialKindEnum('kind').notNull(),
    // BYTEA stored as Buffer in JS — use text for base64 encoding in transit
    ciphertext: text('ciphertext').notNull(), // stored as hex/base64
    nonce: text('nonce').notNull(),
    last4: text('last4'),
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    rotatedAt: timestamp('rotated_at', { withTimezone: true }),
  },
)

export const providerConfigs = pgTable(
  'provider_configs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    baseUrl: text('base_url'),
    credentialId: uuid('credential_id').references(() => credentials.id, {
      onDelete: 'set null',
    }),
    defaultModel: text('default_model'),
    enabled: boolean('enabled').notNull().default(true),
  },
  (t) => [uniqueIndex('provider_configs_user_provider').on(t.userId, t.provider)],
)

export const channelConfigs = pgTable(
  'channel_configs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    channel: text('channel').notNull(),
    credentialId: uuid('credential_id').references(() => credentials.id, {
      onDelete: 'set null',
    }),
    config: jsonb('config').notNull().default({}),
    enabled: boolean('enabled').notNull().default(false),
    status: text('status').notNull().default('disconnected'),
    lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('channel_configs_user_channel').on(t.userId, t.channel)],
)

export const integrations = pgTable(
  'integrations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    credentialId: uuid('credential_id').references(() => credentials.id, {
      onDelete: 'set null',
    }),
    config: jsonb('config').notNull().default({}),
    status: text('status').notNull().default('disconnected'),
    lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('integrations_user_kind').on(t.userId, t.kind)],
)

export const appSettings = pgTable('app_settings', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  routing: jsonb('routing').notNull().default({}),
  inference: jsonb('inference').notNull().default({}),
  search: jsonb('search').notNull().default({}),
  preferences: jsonb('preferences').notNull().default({}),
  privacy: jsonb('privacy').notNull().default({}),
  // Phase 4 (autonomy): per-action control plane for the risky agents
  // (auto-apply, scraping, CRM enrichment). Empty = all off / safe defaults.
  // Shape is defined + defaulted in agents/lib/autonomy.ts.
  autonomy: jsonb('autonomy').notNull().default({}),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// ─────────────────────────────────────────────────────────────
// Job board discovery
// ─────────────────────────────────────────────────────────────
export const jobBoardSources = pgTable(
  'job_board_sources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    board: text('board').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    filters: jsonb('filters').notNull().default({}),
    pollIntervalMinutes: integer('poll_interval_minutes').notNull().default(360),
    lastPolledAt: timestamp('last_polled_at', { withTimezone: true }),
  },
)

export const jobBoardSeen = pgTable(
  'job_board_seen',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    board: text('board').notNull(),
    externalId: text('external_id').notNull(),
    opportunityId: uuid('opportunity_id').references(() => opportunities.id, {
      onDelete: 'set null',
    }),
    seenAt: timestamp('seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('job_board_seen_unique').on(t.userId, t.board, t.externalId)],
)

// ─────────────────────────────────────────────────────────────
// Relations
// ─────────────────────────────────────────────────────────────
export const usersRelations = relations(users, ({ many, one }) => ({
  profile: one(profiles, { fields: [users.id], references: [profiles.userId] }),
  achievements: many(achievements),
  skills: many(skills),
  workExperiences: many(workExperiences),
  educations: many(educations),
  profileProjects: many(profileProjects),
  companies: many(companies),
  opportunities: many(opportunities),
  applications: many(applications),
  agentTasks: many(agentTasks),
  appSettings: one(appSettings, { fields: [users.id], references: [appSettings.userId] }),
}))

export const profilesRelations = relations(profiles, ({ one }) => ({
  user: one(users, { fields: [profiles.userId], references: [users.id] }),
}))

export const companiesRelations = relations(companies, ({ many }) => ({
  briefs: many(companyBriefs),
  opportunities: many(opportunities),
}))

export const companyBriefsRelations = relations(companyBriefs, ({ one }) => ({
  company: one(companies, { fields: [companyBriefs.companyId], references: [companies.id] }),
}))

export const opportunitiesRelations = relations(opportunities, ({ one, many }) => ({
  user: one(users, { fields: [opportunities.userId], references: [users.id] }),
  company: one(companies, { fields: [opportunities.companyId], references: [companies.id] }),
  matchScores: many(matchScores),
  application: one(applications, {
    fields: [opportunities.id],
    references: [applications.opportunityId],
  }),
  resumeVersions: many(resumeVersions),
  coverLetters: many(coverLetters),
}))

export const applicationsRelations = relations(applications, ({ one, many }) => ({
  user: one(users, { fields: [applications.userId], references: [users.id] }),
  opportunity: one(opportunities, {
    fields: [applications.opportunityId],
    references: [opportunities.id],
  }),
  stageEvents: many(stageEvents),
  assetLinks: many(assetLinks),
  interviews: many(interviews),
}))

export const agentTasksRelations = relations(agentTasks, ({ one }) => ({
  user: one(users, { fields: [agentTasks.userId], references: [users.id] }),
}))

// ─────────────────────────────────────────────────────────────
// Inferred types
// ─────────────────────────────────────────────────────────────
export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert

export type Session = typeof sessions.$inferSelect
export type NewSession = typeof sessions.$inferInsert

export type Profile = typeof profiles.$inferSelect
export type NewProfile = typeof profiles.$inferInsert

export type Achievement = typeof achievements.$inferSelect
export type NewAchievement = typeof achievements.$inferInsert

export type Skill = typeof skills.$inferSelect
export type NewSkill = typeof skills.$inferInsert

export type Company = typeof companies.$inferSelect
export type NewCompany = typeof companies.$inferInsert

export type CompanyBrief = typeof companyBriefs.$inferSelect
export type NewCompanyBrief = typeof companyBriefs.$inferInsert

export type Opportunity = typeof opportunities.$inferSelect
export type NewOpportunity = typeof opportunities.$inferInsert

export type MatchScore = typeof matchScores.$inferSelect
export type NewMatchScore = typeof matchScores.$inferInsert

export type Application = typeof applications.$inferSelect
export type NewApplication = typeof applications.$inferInsert

export type StageEvent = typeof stageEvents.$inferSelect
export type NewStageEvent = typeof stageEvents.$inferInsert

export type ResumeVersion = typeof resumeVersions.$inferSelect
export type NewResumeVersion = typeof resumeVersions.$inferInsert

export type CoverLetter = typeof coverLetters.$inferSelect
export type NewCoverLetter = typeof coverLetters.$inferInsert

export type Vvp = typeof vvps.$inferSelect
export type NewVvp = typeof vvps.$inferInsert

export type AssetLink = typeof assetLinks.$inferSelect
export type NewAssetLink = typeof assetLinks.$inferInsert

export type Contact = typeof contacts.$inferSelect
export type NewContact = typeof contacts.$inferInsert

export type OutreachMessage = typeof outreachMessages.$inferSelect
export type NewOutreachMessage = typeof outreachMessages.$inferInsert

export type FollowUp = typeof followUps.$inferSelect
export type NewFollowUp = typeof followUps.$inferInsert

export type Interview = typeof interviews.$inferSelect
export type NewInterview = typeof interviews.$inferInsert

export type MockSession = typeof mockSessions.$inferSelect
export type NewMockSession = typeof mockSessions.$inferInsert

export type AgentTask = typeof agentTasks.$inferSelect
export type NewAgentTask = typeof agentTasks.$inferInsert

export type Credential = typeof credentials.$inferSelect
export type NewCredential = typeof credentials.$inferInsert

export type ProviderConfig = typeof providerConfigs.$inferSelect
export type NewProviderConfig = typeof providerConfigs.$inferInsert

export type ChannelConfig = typeof channelConfigs.$inferSelect
export type NewChannelConfig = typeof channelConfigs.$inferInsert

export type Integration = typeof integrations.$inferSelect
export type NewIntegration = typeof integrations.$inferInsert

export type AppSettings = typeof appSettings.$inferSelect
export type NewAppSettings = typeof appSettings.$inferInsert

export type JobBoardSource = typeof jobBoardSources.$inferSelect
export type NewJobBoardSource = typeof jobBoardSources.$inferInsert

export type JobBoardSeen = typeof jobBoardSeen.$inferSelect
export type NewJobBoardSeen = typeof jobBoardSeen.$inferInsert

export type WorkExperience = typeof workExperiences.$inferSelect
export type NewWorkExperience = typeof workExperiences.$inferInsert

export type Education = typeof educations.$inferSelect
export type NewEducation = typeof educations.$inferInsert

export type ProfileProject = typeof profileProjects.$inferSelect
export type NewProfileProject = typeof profileProjects.$inferInsert
