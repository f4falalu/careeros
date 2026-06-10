-- CareerOS — Data Schema (PostgreSQL + pgvector)
-- v1: single-user, but every owned row carries user_id so multi-user is a later migration, not a rewrite.
-- See docs/02-ARCHITECTURE.md §4 for the entity overview.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;          -- pgvector
CREATE EXTENSION IF NOT EXISTS pg_trgm;          -- fuzzy company-name matching

-- ─────────────────────────────────────────────────────────────
-- Enums
-- ─────────────────────────────────────────────────────────────
CREATE TYPE work_model      AS ENUM ('remote', 'hybrid', 'onsite', 'unknown');
CREATE TYPE pipeline_stage  AS ENUM ('saved','applied','assessment','interview','final','offer','rejected','withdrawn');
CREATE TYPE asset_kind      AS ENUM ('resume_version','cover_letter','vvp','interview_brief','other');
CREATE TYPE contact_role    AS ENUM ('recruiter','hiring_manager','founder','referral','other');
CREATE TYPE message_channel AS ENUM ('email','linkedin','telegram','whatsapp','other');
CREATE TYPE message_state   AS ENUM ('draft','approved','sent','replied','bounced','archived');
CREATE TYPE vvp_kind        AS ENUM ('audit','growth_strategy','automation','market_analysis','product_improvement','analytics_dashboard','other');
CREATE TYPE vvp_format      AS ENUM ('report','slides','prototype_spec');
CREATE TYPE agent_status    AS ENUM ('queued','running','succeeded','failed','needs_approval','cancelled');
CREATE TYPE model_kind      AS ENUM ('local','cloud');
CREATE TYPE source_channel  AS ENUM ('telegram','whatsapp','web','manual','job_board');

-- ─────────────────────────────────────────────────────────────
-- Identity
-- ─────────────────────────────────────────────────────────────
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email           TEXT UNIQUE,
    display_name    TEXT,
    telegram_user_id TEXT,            -- bot is locked to known ids
    whatsapp_number  TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Career profile: the single source of truth the resume agent may NOT fabricate beyond.
CREATE TABLE profiles (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    master_resume   JSONB NOT NULL DEFAULT '{}'::jsonb,   -- structured master CV
    tone_prefs      JSONB NOT NULL DEFAULT '{}'::jsonb,   -- {formal|warm|direct, ...}
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id)
);

-- Atomic, reusable achievements (RAG source for tailoring + interview STAR answers).
CREATE TABLE achievements (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    summary         TEXT NOT NULL,
    detail          TEXT,
    skills          TEXT[] DEFAULT '{}',
    metrics         JSONB DEFAULT '{}'::jsonb,            -- quantified impact
    embedding       vector(768),                          -- match dim to chosen embed model
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE skills (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    proficiency     SMALLINT,                             -- 1..5, nullable
    years           NUMERIC(4,1),
    UNIQUE (user_id, name)
);

-- ─────────────────────────────────────────────────────────────
-- Companies & research
-- ─────────────────────────────────────────────────────────────
CREATE TABLE companies (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    domain          TEXT,
    industry        TEXT,
    hq_location     TEXT,
    size_band       TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, name, domain)
);
CREATE INDEX companies_name_trgm ON companies USING gin (name gin_trgm_ops);

-- A company brief is versioned & sourced; research agent must cite.
CREATE TABLE company_briefs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    content         JSONB NOT NULL,        -- {business_model, products, funding, competitors, leadership, news, culture, hiring_signals}
    sources         JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{title,url,fetched_at}]
    embedding       vector(768),
    fetched_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_stale        BOOLEAN NOT NULL DEFAULT false
);

-- ─────────────────────────────────────────────────────────────
-- Opportunities (jobs) & pipeline
-- ─────────────────────────────────────────────────────────────
CREATE TABLE opportunities (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    company_id      UUID REFERENCES companies(id) ON DELETE SET NULL,
    role_title      TEXT NOT NULL,
    seniority       TEXT,
    location        TEXT,
    work_model      work_model DEFAULT 'unknown',
    salary_text     TEXT,
    visa_signal     TEXT,
    required_skills TEXT[] DEFAULT '{}',
    nice_to_haves   TEXT[] DEFAULT '{}',
    description     TEXT,                                  -- raw JD text
    source_url      TEXT,
    apply_url       TEXT,
    source_channel  source_channel NOT NULL DEFAULT 'manual',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX opportunities_user ON opportunities(user_id);

CREATE TABLE match_scores (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    opportunity_id  UUID NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
    score           NUMERIC(4,1) NOT NULL,                 -- 0..100
    missing_skills  TEXT[] DEFAULT '{}',
    rationale       TEXT,
    computed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One application per opportunity; stage history kept separately.
CREATE TABLE applications (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    opportunity_id  UUID NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
    stage           pipeline_stage NOT NULL DEFAULT 'saved',
    applied_at      TIMESTAMPTZ,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (opportunity_id)
);
CREATE INDEX applications_stage ON applications(user_id, stage);

CREATE TABLE stage_events (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id  UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    from_stage      pipeline_stage,
    to_stage        pipeline_stage NOT NULL,
    actor           TEXT NOT NULL DEFAULT 'user',          -- 'user' | 'agent:<name>'
    note            TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- Assets: resume versions, cover letters, VVPs, interview briefs
-- ─────────────────────────────────────────────────────────────
CREATE TABLE resume_versions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    opportunity_id  UUID REFERENCES opportunities(id) ON DELETE SET NULL,
    label           TEXT NOT NULL,                         -- e.g. resume_v3_acme_pm
    content         JSONB NOT NULL,                        -- structured, render-agnostic
    pdf_path        TEXT,                                  -- object store key
    ats_score       NUMERIC(4,1),
    validated       BOOLEAN NOT NULL DEFAULT false,        -- no-fabrication validator passed
    embedding       vector(768),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE cover_letters (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    opportunity_id  UUID REFERENCES opportunities(id) ON DELETE SET NULL,
    tone            TEXT,
    body            TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE vvps (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    opportunity_id  UUID REFERENCES opportunities(id) ON DELETE SET NULL,
    company_id      UUID REFERENCES companies(id) ON DELETE SET NULL,
    kind            vvp_kind NOT NULL,
    format          vvp_format NOT NULL DEFAULT 'report',
    title           TEXT NOT NULL,
    content         JSONB NOT NULL,
    sources         JSONB NOT NULL DEFAULT '[]'::jsonb,
    artifact_path   TEXT,                                  -- pdf/pptx key
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Generic link table so an application can reference any asset.
CREATE TABLE asset_links (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id  UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    kind            asset_kind NOT NULL,
    asset_id        UUID NOT NULL,                         -- points at resume_versions/cover_letters/vvps/...
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- Contacts, outreach, follow-ups
-- ─────────────────────────────────────────────────────────────
CREATE TABLE contacts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    company_id      UUID REFERENCES companies(id) ON DELETE SET NULL,
    name            TEXT NOT NULL,
    role            contact_role NOT NULL DEFAULT 'other',
    title           TEXT,
    email           TEXT,
    linkedin_url    TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE outreach_messages (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    contact_id      UUID REFERENCES contacts(id) ON DELETE SET NULL,
    opportunity_id  UUID REFERENCES opportunities(id) ON DELETE SET NULL,
    channel         message_channel NOT NULL DEFAULT 'email',
    subject         TEXT,
    body            TEXT NOT NULL,
    state           message_state NOT NULL DEFAULT 'draft', -- v1: never auto-past 'approved' without user action
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at         TIMESTAMPTZ
);

CREATE TABLE follow_ups (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    outreach_id     UUID NOT NULL REFERENCES outreach_messages(id) ON DELETE CASCADE,
    due_at          TIMESTAMPTZ NOT NULL,
    drafted_body    TEXT,
    state           message_state NOT NULL DEFAULT 'draft',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- Interviews
-- ─────────────────────────────────────────────────────────────
CREATE TABLE interviews (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    application_id  UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    scheduled_at    TIMESTAMPTZ,
    brief           JSONB,                                 -- {recap, likely_qs, star_answers, tech_topics}
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE mock_sessions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    interview_id    UUID NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
    transcript      JSONB NOT NULL DEFAULT '[]'::jsonb,     -- [{role, text, ts}]
    feedback        TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- Agent audit log — written by EVERY agent run (see CLAUDE.md principle 4)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE agent_tasks (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    agent_name      TEXT NOT NULL,                         -- intake|research|resume|cover|vvp|outreach|...
    status          agent_status NOT NULL DEFAULT 'queued',
    source_channel  source_channel NOT NULL DEFAULT 'web',
    related_type    TEXT,                                  -- 'opportunity'|'application'|...
    related_id      UUID,
    input           JSONB,
    output          JSONB,
    tools_used      TEXT[] DEFAULT '{}',
    model_kind      model_kind,                            -- local | cloud (router decision)
    model_name      TEXT,
    cost_usd        NUMERIC(10,4) DEFAULT 0,
    error           TEXT,
    started_at      TIMESTAMPTZ,
    finished_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX agent_tasks_feed ON agent_tasks(user_id, created_at DESC);
CREATE INDEX agent_tasks_status ON agent_tasks(user_id, status);

-- ─────────────────────────────────────────────────────────────
-- Vector indexes (ivfflat; tune lists after data exists)
-- ─────────────────────────────────────────────────────────────
CREATE INDEX achievements_embed ON achievements USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX briefs_embed       ON company_briefs USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX resumes_embed      ON resume_versions USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- NOTE: embedding dim (768) must match the chosen local embedding model (e.g. nomic-embed-text).
-- If you switch models, change the vector(N) columns and reindex.

-- ─────────────────────────────────────────────────────────────
-- Settings & configuration (see docs/10-SETTINGS.md)
-- Secrets are encrypted at rest; plaintext is never stored or returned.
-- ─────────────────────────────────────────────────────────────
CREATE TYPE credential_kind AS ENUM ('api_key','oauth_token','bearer','basic','webhook_secret');

CREATE TABLE credentials (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label         TEXT NOT NULL,                 -- 'openrouter','telegram','tavily',...
    kind          credential_kind NOT NULL,
    ciphertext    BYTEA NOT NULL,                -- AES-GCM(secret), key derived from APP_SECRET
    nonce         BYTEA NOT NULL,
    last4         TEXT,                          -- masked preview only
    status        TEXT NOT NULL DEFAULT 'active',-- 'active' | 'retiring' (old key during dual-key rotation)
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    rotated_at    TIMESTAMPTZ
);
-- Dual-key rotation (see SECURITY.md B2a): allow a second key per label ONLY while one is 'retiring',
-- so old+new are both valid during the zero-downtime transition window. Exactly one 'active' per label.
CREATE UNIQUE INDEX credentials_one_active ON credentials (user_id, label) WHERE status = 'active';

CREATE TABLE provider_configs (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider      TEXT NOT NULL,                 -- 'openrouter'|'anthropic'|'openai'|'ollama'
    base_url      TEXT,
    credential_id UUID REFERENCES credentials(id) ON DELETE SET NULL,
    default_model TEXT,
    enabled       BOOLEAN NOT NULL DEFAULT true,
    UNIQUE (user_id, provider)
);

CREATE TABLE channel_configs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    channel         TEXT NOT NULL,               -- 'telegram'|'whatsapp'
    credential_id   UUID REFERENCES credentials(id) ON DELETE SET NULL,
    config          JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {allowed_user_ids, session, base_url, webhook_url}
    enabled         BOOLEAN NOT NULL DEFAULT false,
    status          TEXT NOT NULL DEFAULT 'disconnected',
    last_checked_at TIMESTAMPTZ,
    UNIQUE (user_id, channel)
);

CREATE TABLE integrations (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind            TEXT NOT NULL,               -- 'gmail'|'gcal'|'gdrive'|'n8n'|'s3'
    credential_id   UUID REFERENCES credentials(id) ON DELETE SET NULL,
    config          JSONB NOT NULL DEFAULT '{}'::jsonb,
    status          TEXT NOT NULL DEFAULT 'disconnected',
    last_sync_at    TIMESTAMPTZ,
    UNIQUE (user_id, kind)
);

CREATE TABLE app_settings (
    user_id         UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    routing         JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {model_tier, cloud_fallback, per_task, cost_cap_usd}
    inference       JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {ollama_base_url, embedding_model}
    search          JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {provider, searxng_url}
    preferences     JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {tone, theme, followup_cadence, currency, timezone}
    privacy         JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {block_cloud_personal_data}
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- Job board discovery (see docs/11-JOB-BOARDS.md) — official feeds only, no scraping.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE job_board_sources (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    board         TEXT NOT NULL,                 -- 'remotive'|'remoteok'|'weworkremotely'
    enabled       BOOLEAN NOT NULL DEFAULT true,
    filters       JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {category, keywords[], min_salary, regions[]}
    poll_interval_minutes INT NOT NULL DEFAULT 360,
    last_polled_at TIMESTAMPTZ,
    UNIQUE (user_id, board, filters)
);

CREATE TABLE job_board_seen (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    board         TEXT NOT NULL,
    external_id   TEXT NOT NULL,                 -- board job id, or hash(url+title+company)
    opportunity_id UUID REFERENCES opportunities(id) ON DELETE SET NULL,
    seen_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, board, external_id)
);
