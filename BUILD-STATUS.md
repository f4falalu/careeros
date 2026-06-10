# CareerOS — Build Status & Handoff Tracker

**Last updated:** 2026-06-09 (Phases 4–5 foundation built)  
**Phase:** 4 — Autonomy (built, OFF by default) + 5 — Foundation (tenancy + auth scaffold)  
**Stack running:** YES — all 6 Docker services up (see §5)

> ⚠️ **Run the new migration before starting the API:** `drizzle/0001_autonomy_and_auth_foundation.sql`
> (adds `sessions`, `app_settings.autonomy`, `applications.auto_applied`, `users.password_hash`).
> `cd apps/api && npm run db:migrate` (or `db:push`).

---

## 1. What Is Done

### Infrastructure & DevOps
| Item | Status | Notes |
|---|---|---|
| `docker-compose.yml` — 6 services | DONE | postgres, redis, ollama, api, searxng, web |
| Postgres (pgvector:pg16) | DONE | Healthy, schema initialized |
| Redis 7 | DONE | BullMQ + pub/sub working |
| Ollama | DONE | `llama3.2:3b` pulled and loaded |
| SearXNG self-hosted | DONE | Port 8888, JSON format enabled, `secret_key` set |
| `.env` at project root | DONE | `APP_SECRET` generated |
| `apps/web/.env.local` | DONE | `NEXT_PUBLIC_*` vars wired |

### Backend — `apps/api/`
| File | Lines | Status | Notes |
|---|---|---|---|
| `src/db/schema.ts` | 690 | DONE | Full schema: profiles, opportunities, applications, companies, achievements, skills, match_scores, resume_versions, cover_letters, agent_tasks, stage_events, company_briefs, outreach_drafts |
| `src/router/modelRouter.ts` | 109 | DONE | `generateStructured` + `complete`; Ollama local path + cloud stub |
| `src/workers/queue.ts` | 21 | DONE | BullMQ queue `careeros-agents` (no colons) |
| `src/workers/agentWorker.ts` | 190 | DONE | Dispatches all 6 agents; publishes WS events on completion |
| `src/ws/index.ts` | — | DONE | `/ws` WebSocket; Redis sub → push to connected clients |
| `src/middleware/auth.ts` | — | DONE | Bearer token guard using `APP_SECRET` |
| `src/orchestrator/index.ts` | 234 | DONE | `handleIntake` + `handleMenuAction`; creates AgentTask rows, enqueues jobs |
| `src/agents/lib/tools.ts` | 107 | DONE | `webFetch` (SSRF guard), `search` (SearXNG → Tavily fallback), `cleanUrl` |
| `src/agents/lib/task.ts` | — | DONE | `markRunning` / `markSucceeded` / `markFailed` helpers |
| `src/agents/intake.ts` | 214 | DONE | Fetches URL, LLM extraction, upserts company + opportunity, enqueues research+match |
| `src/agents/research.ts` | 158 | DONE | 3 SearXNG queries, fetches top pages, LLM summary → `company_briefs` |
| `src/agents/match.ts` | 137 | DONE | Deterministic skill overlap score + LLM rationale → `match_scores` |
| `src/agents/resume.ts` | 237 | DONE | Tailored resume + no-fabrication validator → `resume_versions` |
| `src/agents/cover.ts` | 155 | DONE | Grounded cover letter → `cover_letters` |
| `src/agents/tracker.ts` | 100 | DONE | Stage transition + `stage_events` insert |
| `src/routes/intake.ts` | 74 | DONE | `POST /intake` |
| `src/routes/opportunities.ts` | 153 | DONE | CRUD + `POST /opportunities/:id/resume`, `POST /opportunities/:id/match` |
| `src/routes/applications.ts` | 159 | DONE | CRUD + `PATCH /applications/:id/stage` |
| `src/routes/companies.ts` | 77 | DONE | `GET /companies`, `POST /companies/:id/brief` |
| `src/routes/profile.ts` | 77 | DONE | `GET/PUT /profile`, `GET /profile/skills`, `POST /profile/skills` |
| `src/routes/tasks.ts` | 97 | DONE | `GET /tasks`, `POST /tasks/:id/approve` |
| `src/routes/assets.ts` | 125 | DONE | `GET /opportunities/:id/resume` (latest), `GET /resume-versions/:id/pdf` (stub) |
| `src/routes/actions.ts` | — | DONE | `POST /opportunities/:id/cover-letter` |
| `src/routes/achievements.ts` | — | DONE | `GET/POST /achievements` |
| `src/routes/settings.ts` | — | DONE | `GET/PUT /settings` |
| `src/channels/telegram.ts` | — | DONE | Bot auth guard, URL detection, numbered menu |
| `src/main.ts` | — | DONE | Hono app, all routes mounted, WS server, worker start |

### Frontend — `apps/web/`
| File | Lines | Status | Notes |
|---|---|---|---|
| `src/types.ts` | 93 | DONE | All TS interfaces + enums matching API |
| `src/lib/api.ts` | 97 | DONE | Typed fetch client with Bearer auth |
| `src/lib/ws.ts` | 45 | DONE | `useAgentTaskStream` hook with auto-reconnect (3s) |
| `src/lib/queryClient.ts` | — | DONE | React Query client |
| `src/app/globals.css` | — | DONE | CSS vars, pill classes (status + stage), `.hover-lift` |
| `src/app/layout.tsx` | — | DONE | Inter font, providers wrapper |
| `src/components/layout/Sidebar.tsx` | 91 | DONE | 260px fixed; Dashboard/Jobs/Resume nav |
| `src/components/layout/Header.tsx` | 87 | DONE | Inline intake input → `POST /intake` |
| `src/components/layout/Shell.tsx` | — | DONE | Sidebar + main content wrapper |
| `src/app/page.tsx` | 76 | DONE | Home dashboard with KPI cards + AgentTaskFeed |
| `src/components/cards/AgentTaskFeed.tsx` | 103 | DONE | Live feed via WS + React Query; Approve button |
| `src/components/cards/KpiCard.tsx` | — | DONE | Stat card component |
| `src/components/cards/RecentOpportunities.tsx` | — | DONE | Recent list component |
| `src/app/opportunities/page.tsx` | 6 | DONE | Route page (renders KanbanBoard) |
| `src/components/kanban/KanbanBoard.tsx` | 96 | DONE | 6 active columns; fetches opps + apps, joins client-side |
| `src/components/kanban/OpportunityCard.tsx` | 170 | DONE | Stage dropdown, generate resume/cover letter buttons |
| `src/app/resume/page.tsx` | 6 | DONE | Route page (renders ResumeStudio) |
| `src/components/resume/ResumeStudio.tsx` | 190 | DONE | Per-opportunity view, match score, missing skills, one-click generate |

---

## 1b. Phase 2 — What Was Just Built

| File | Status | Notes |
|---|---|---|
| `src/agents/vvp.ts` | DONE | Two-step: `runVvpProposeAgent` (angles) + `runVvpGenerateAgent` (artifact) |
| `src/agents/outreach.ts` | DONE | `runOutreachAgent` — draft only, `needs_approval=true` guardrail |
| `src/routes/vvp.ts` | DONE | `POST /opportunities/:id/vvp/propose`, `POST /vvps/:id/generate`, `GET /vvps`, `GET /vvps/:id`, `GET /opportunities/:id/vvps` |
| `src/routes/outreach.ts` | DONE | `POST /opportunities/:id/outreach`, `GET /outreach`, `PATCH /outreach/:id/approve`, `PATCH /outreach/:id/archive` |
| `src/routes/contacts.ts` | DONE | Full CRUD: `GET/POST /contacts`, `GET/PATCH/DELETE /contacts/:id` |
| `src/workers/agentWorker.ts` | UPDATED | `vvp_propose`, `vvp_generate`, `outreach` cases added |
| `src/orchestrator/index.ts` | UPDATED | `build_vvp` + `draft_outreach` dispatch real agents (stubs removed) |
| `src/routes/actions.ts` | UPDATED | Same stub replacement |
| `src/main.ts` | UPDATED | Mounts `vvpRoutes`, `outreachRoutes`, `contactsRoutes`; removes stub handlers |
| `apps/web/src/types.ts` | UPDATED | `Vvp`, `OutreachMessage`, `Contact` types added |
| `apps/web/src/lib/api.ts` | UPDATED | `api.vvp`, `api.outreach`, `api.contacts` added |
| `apps/web/src/components/layout/Sidebar.tsx` | UPDATED | VVP Workspace + Outreach Hub links added |
| `apps/web/src/components/kanban/OpportunityCard.tsx` | UPDATED | Build VVP + Draft Outreach buttons |
| `apps/web/src/app/vvp/page.tsx` + `VvpWorkspace.tsx` | DONE | Two-pane: list + proposal/artifact detail |
| `apps/web/src/app/outreach/page.tsx` + `OutreachHub.tsx` | DONE | Filter tabs, expandable cards, approve/archive/copy |

---

## 2. What Is NOT Done (Next Builder Picks Up Here)

### P0 — ALL CLOSED ✓

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | **Resume PDF generation** | DONE | `lib/pdf.ts` + Playwright/Chromium in Dockerfile + `GET /resume-versions/:id/pdf` fully implemented |
| 2 | **Telegram bot wiring** | DONE (config only) | `startTelegramBot()` called in `main.ts`. Set `TELEGRAM_BOT_TOKEN` + `TELEGRAM_ALLOWED_USER_IDS` in `.env` + run ngrok/cloudflared tunnel |
| 3 | **Profile seed** | DONE | `scripts/seed-profile.sh` — edit JSON payloads, run `bash scripts/seed-profile.sh` |
| 4 | **End-to-end smoke test** | PENDING MANUAL | Paste a real job URL → verify intake → research + match fire → Kanban card appears → resume generates → PDF downloads |

### P1 — ALL CLOSED ✓

| # | Task | Status | Notes |
|---|---|---|---|
| 5 | **WebSocket auth** | DONE | `ws/index.ts` checks `?token=` query param against `APP_SECRET` |
| 6 | **Drizzle migrations** | DONE | `apps/api/drizzle/0000_blue_nebula.sql` committed |
| 7 | **Resume download UX** | DONE | Download button in ResumeStudio calls the live PDF endpoint |
| 8 | **Cover letter display** | DONE | `CoverLetterModal` in `OpportunityCard` — click the wand icon after generating |
| 9 | **Outreach draft display** | DONE | `OutreachHub.tsx` — filter tabs, approve/archive/copy |
| 10 | **Company brief display** | DONE | `CompanyBriefPanel` in ResumeStudio expanded row; fetches `GET /companies/:id` lazily |
| 11 | **Error states in UI** | DONE | Inline error messages in KanbanBoard, ResumeStudio, Dashboard, RecentOpportunities |

### Phase 2.5 — COMPLETE ✓

| Item | Status | Notes |
|---|---|---|
| Board adapters | DONE | `agents/lib/boards/` — Remotive, Remote OK, WeWorkRemotely; shared `JobBoardAdapter` interface |
| Discovery worker | DONE | `workers/discoveryWorker.ts` — 15-min tick, polls due sources, fetch→normalize→dedupe→insert→enqueue match |
| Dedupe ledger | DONE | `job_board_seen` table + `onConflictDoNothing` guard |
| Job boards API | DONE | `GET/POST/PATCH/DELETE /job-boards/sources`, `POST /job-boards/sources/:id/poll` |
| `source` filter on `/opportunities` | DONE | `?source=job_board` added to `GET /opportunities` |
| Discovered feed | DONE | `DiscoveredFeed.tsx` on dashboard; links to source; one-click Track |
| Settings panel | DONE | `JobBoardsPanel.tsx` in Settings — add/toggle/delete/poll-now, keyword filters, interval |
| Daily Telegram digest | DEFERRED | Needs Telegram bot token configured; deferred to Phase 3 |

### Phase 3 — COMPLETE ✓

| File | Status | Notes |
|---|---|---|
| `src/agents/interview.ts` | DONE | `runInterviewBriefAgent` (brief with questions/STAR/angles/pitch) + `runMockSessionAgent` (Q&A coach) |
| `src/agents/followup.ts` | DONE | `runFollowupAgent` — drafts day-3/7/14 follow-up nudges for an outreach message |
| `src/agents/strategist.ts` | DONE | `runStrategistAgent` — reads full pipeline graph → skill gaps + targeting + suggestions |
| `src/routes/interviews.ts` | DONE | `POST /applications/:id/interview-brief`, `GET /interviews`, `GET /interviews/:id`, `GET /applications/:id/interview`, `POST /interviews/:id/mock`, `GET /interviews/:id/mock-sessions` |
| `src/routes/followups.ts` | DONE | `POST/GET /outreach/:id/followups`, `PATCH /followups/:id/approve` |
| `src/routes/strategist.ts` | DONE | `POST /strategist/analyze`, `GET /strategist/latest` |
| `src/workers/agentWorker.ts` | UPDATED | `interview_brief`, `mock_session`, `followup`, `strategist` cases added |
| `src/orchestrator/index.ts` | UPDATED | `prep_interview` action dispatches interview_brief agent; Telegram menu item 6 added |
| `src/main.ts` | UPDATED | Mounts `interviewsRoutes`, `followupsRoutes`, `strategistRoutes`; auth middleware for new prefixes |
| `apps/web/src/types.ts` | UPDATED | `Interview`, `MockSession`, `MockTurn`, `FollowUp`, `StrategistReport`, `StrategistTask` types |
| `apps/web/src/lib/api.ts` | UPDATED | `api.interviews`, `api.followups`, `api.strategist` added |
| `apps/web/src/app/interviews/page.tsx` + `InterviewCenter.tsx` | DONE | Two-pane: list + brief/mock Q&A tabs; question cards with hints; STAR stories; coach feedback |
| `apps/web/src/app/analytics/page.tsx` + `PipelineAnalytics.tsx` | DONE | Stage bars + strategist report: skill gaps, targeting advice, do-this-week suggestions |
| `apps/web/src/components/layout/Sidebar.tsx` | UPDATED | Interview Center + Analytics nav links |
| `apps/web/src/components/kanban/OpportunityCard.tsx` | UPDATED | Purple mic button appears at interview/final/offer stage → triggers brief generation |

### Phase 4 — Autonomy (BUILT, OFF BY DEFAULT) ✓

All gated behind **Settings → Autonomy** (`app_settings.autonomy`); safe defaults = everything off,
auto-apply requires confirmation. Agents re-check the gates themselves (defense in depth).

| File | Status | Notes |
|---|---|---|
| `src/agents/lib/autonomy.ts` | DONE | `AutonomySchema` + safe defaults, `getAutonomy()`, `hostAllowed()` suffix-match |
| `src/agents/apply.ts` | DONE | Gates: master switch → per-site allowlist → daily cap → human confirm (`needs_approval` → `POST /tasks/:id/approve`). `submitToAts()` is a stubbed seam (no live 3rd-party POST); records application=applied + `stage_event` actor `agent:apply` |
| `src/agents/enrich.ts` | DONE | Low-risk CRM enrichment from public search; fills only missing fields, never fabricates email |
| `src/agents/scrape.ts` | DONE | Risky careers-page scraping; master switch + domain allowlist + SSRF guard; dedupes via `job_board_seen` (board=`scrape`) |
| `src/routes/autonomy.ts` | DONE | `POST /opportunities/:id/apply`, `POST /contacts/:id/enrich`, `POST /job-boards/scrape` |
| `src/workers/agentWorker.ts` | UPDATED | `apply`/`enrich`/`scrape` cases + `needsApproval` → task parked in `needs_approval` |
| `src/orchestrator/index.ts` | UPDATED | `auto_apply` menu action |
| `src/routes/settings.ts` | UPDATED | `autonomy` read/write, normalized through `AutonomySchema` |
| `apps/web` — `AutonomyPanel.tsx`, `types.ts`, `lib/api.ts`, `OpportunityCard.tsx` | DONE | Toggle UI in Settings; auto-apply (Send) button on cards |

### Phase 5 — Production readiness (FOUNDATION ONLY) ✓

Gate (`docs/12 §0`) not met → only the migration-ready foundation. Billing/secrets-store/scaling/
observability/compliance deferred.

| File | Status | Notes |
|---|---|---|
| `src/db/schema.ts` | UPDATED | `users.password_hash`, `sessions` table |
| `src/lib/password.ts` | DONE | scrypt hash + constant-time verify; opaque session tokens (only SHA-256 hash stored) |
| `src/routes/auth.ts` | DONE | `POST /auth/register|login|logout`, `GET /auth/me`. **Scaffold — flagged for human security review (SECURITY.md B3);** no email-verify/reset/lockout yet |
| `src/middleware/auth.ts` | UPDATED | Accepts legacy `APP_SECRET` bearer (single owner) OR a session token; tenancy via resolved `userId` |

> **Auth scaffold caveat:** registration creates additional users — do not expose `/auth/*` publicly
> until the flow (verification, reset, rate-limit, lockout) is human-designed. The web app still uses the
> single-owner `APP_SECRET` bearer; nothing is wired to the session flow yet.

### P2 — remaining deferred features (don't build yet)

| # | Task | Notes |
|---|---|---|
| 12 | Job board discovery (compliant feeds) | Phase 2.5 per roadmap |
| 13 | Outreach / email draft flow | Phase 2 |
| 14 | WhatsApp channel | Phase 2, best-effort |
| 15 | Multi-tenancy / real auth | Phase 5, explicitly deferred |
| 16 | Auto-apply | Phase 4, human-in-the-loop gate required |

---

## 3. Known Bugs & Workarounds Applied

| Bug | Fix Applied | Location |
|---|---|---|
| `BullMQ: Queue name cannot contain ':'` | Changed `QUEUE_NAME` from `careeros:agents` to `careeros-agents` | `apps/api/src/workers/queue.ts:4` |
| `@types/mozilla__readability@^0.5.0` not on npm | Pinned to `^0.4.2` | `apps/api/package.json` |
| `is_stale GENERATED ALWAYS AS (now() - ...)` fails (volatile fn in generated col) | Changed to `is_stale BOOLEAN NOT NULL DEFAULT false` | `docs/07-SCHEMA.sql` + `apps/api/src/db/schema.ts` |
| Docker build context 362MB (node_modules sent to BuildKit) | Created `apps/web/.dockerignore` | `apps/web/.dockerignore` |
| SearXNG crashes: `secret_key is not changed` | Added `secret_key` to settings.yml | `config/searxng/settings.yml` |
| SearXNG returns 403 on `/search?format=json` | Added `formats: [html, json]` to settings.yml | `config/searxng/settings.yml` |
| Next.js CVE (15.1.0) | Upgraded to 15.5.19 | `apps/web/package.json` |

---

## 4. Architecture Quick Reference

```
User
 ├── Telegram → telegram.ts → orchestrator → BullMQ → agentWorker
 └── Browser → Next.js (port 3000) → API (port 8000)
                                         │
                                    Hono routes
                                         │
                              ┌──────────┴──────────┐
                           BullMQ               WebSocket /ws
                           (Redis)           (Redis pub/sub)
                              │
                         agentWorker
                              │
              ┌───────────────┼───────────────┐
           intake         research          match
              │                              │
           resume           cover         tracker
              │
      modelRouter → Ollama (llama3.2:3b) [local]
                  → OpenAI-compat cloud   [fallback, disabled]
```

**Auth:** `Authorization: Bearer ${APP_SECRET}` on all HTTP requests. WS has no auth (single-user local).  
**DB access:** Drizzle ORM + `postgres.js`; connection string from `DATABASE_URL` env.  
**Queue name:** `careeros-agents` (no colons — BullMQ constraint).

---

## 5. Running the Stack

```bash
# Start all services
cd /Users/fbarde/Documents/CareerOS/careeros
docker compose up -d

# Health check
curl http://localhost:8000/health
# Expected: {"status":"ok","db":true,"redis":true,"ollama":true,"ollamaModels":["llama3.2:3b"],...}

# Services
# API:      http://localhost:8000
# Web:      http://localhost:3000
# SearXNG:  http://localhost:8888
# Ollama:   http://localhost:11434
# Postgres: localhost:5432  (user=careeros, db=careeros)
# Redis:    localhost:6379
```

**To restart a single service:**
```bash
docker compose restart api
docker compose logs api --tail=50 -f
```

**To reset the DB (wipes all data):**
```bash
docker compose down -v
rm -rf ./data/postgres
docker compose up -d postgres
# Wait ~10s for healthy, then:
docker compose up -d
```

---

## 6. Environment Variables

All secrets in `.env` at project root. Key vars:

| Var | Value | Purpose |
|---|---|---|
| `APP_SECRET` | `f79ae2f0...` | API Bearer token |
| `DATABASE_URL` | `postgres://careeros:careeros@postgres:5432/careeros` | Postgres |
| `REDIS_URL` | `redis://redis:6379` | Redis |
| `OLLAMA_URL` | `http://ollama:11434` | Ollama |
| `SEARXNG_URL` | `http://searxng:8080` | SearXNG (internal) |
| `TELEGRAM_BOT_TOKEN` | *(not set)* | Set to enable Telegram |
| `TELEGRAM_ALLOWED_USER_IDS` | *(not set)* | Comma-separated Telegram user IDs |
| `MODEL_TIER` | `B` | Controls which Ollama model class to use |

---

## 7. File Map (Key Paths)

```
careeros/
├── .env                            ← secrets (gitignored)
├── docker-compose.yml
├── config/searxng/settings.yml     ← SearXNG config (secret_key + json format)
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── main.ts             ← Hono app entrypoint
│   │   │   ├── config.ts           ← env var parsing
│   │   │   ├── db/schema.ts        ← Drizzle schema (690 lines)
│   │   │   ├── router/modelRouter.ts
│   │   │   ├── orchestrator/index.ts
│   │   │   ├── workers/agentWorker.ts
│   │   │   ├── workers/queue.ts
│   │   │   ├── ws/index.ts
│   │   │   ├── agents/
│   │   │   │   ├── intake.ts
│   │   │   │   ├── research.ts
│   │   │   │   ├── match.ts
│   │   │   │   ├── resume.ts
│   │   │   │   ├── cover.ts
│   │   │   │   ├── tracker.ts
│   │   │   │   └── lib/{tools.ts,task.ts}
│   │   │   └── routes/
│   │   │       ├── intake.ts
│   │   │       ├── opportunities.ts
│   │   │       ├── applications.ts
│   │   │       ├── companies.ts
│   │   │       ├── profile.ts
│   │   │       ├── tasks.ts
│   │   │       ├── assets.ts       ← PDF stub lives here
│   │   │       ├── actions.ts
│   │   │       ├── achievements.ts
│   │   │       └── settings.ts
│   └── web/
│       └── src/
│           ├── types.ts
│           ├── lib/{api.ts,ws.ts,queryClient.ts,utils.ts}
│           ├── providers.tsx
│           ├── app/
│           │   ├── layout.tsx
│           │   ├── globals.css
│           │   ├── page.tsx              ← Home/Dashboard
│           │   ├── opportunities/page.tsx ← Kanban
│           │   └── resume/page.tsx        ← Resume Studio
│           └── components/
│               ├── layout/{Sidebar,Header,Shell}.tsx
│               ├── cards/{AgentTaskFeed,KpiCard,RecentOpportunities}.tsx
│               ├── kanban/{KanbanBoard,OpportunityCard}.tsx
│               └── resume/ResumeStudio.tsx
└── docs/
    ├── 00-CONCEPT-NOTE.md
    ├── 01-PRD.md
    ├── 02-TECH-STACK.md
    ├── 03-ENV-AND-CONFIG.md
    ├── 04-ROADMAP.md
    └── 07-SCHEMA.sql
```
