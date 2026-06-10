# CareerOS — Build Roadmap

Phased so each milestone is independently useful. Build the **vertical slice first**
(one job → one tailored resume, via Telegram) before widening to all agents.

---

## Phase 0 — Foundations ✅ COMPLETE
**Goal:** the skeleton runs and one local model answers.
- [x] Docker Compose: postgres+pgvector, redis, ollama, api, searxng, web (6 services)
- [x] DB schema + migrations (`apps/api/drizzle/0000_blue_nebula.sql`)
- [x] Model Router with local (Ollama) path + stub cloud path; logs model choice
- [x] Hono API + health check; Next.js app shell
- [x] `.env` wiring; `llama3.2:3b` pulled; round-trip completion confirmed

## Phase 1 — Core vertical slice (MVP) ✅ COMPLETE
**Goal:** paste a job link → get a tailored resume + company brief back; see it in the dashboard.
- [x] **Telegram bot** ingress (`channels/telegram.ts`) — code wired; needs `TELEGRAM_BOT_TOKEN` in `.env` + tunnel
- [x] **Intake Agent**: URL → Opportunity + Company extraction (`agents/intake.ts`)
- [x] **Research Agent**: SearXNG → Company Brief (`agents/research.ts`)
- [x] **Resume Agent**: master profile → tailored version + no-fabrication validator → PDF (`agents/resume.ts`, `lib/pdf.ts`)
- [x] **Cover Agent**: cover letter, tone variants (`agents/cover.ts`)
- [x] **Tracker Agent**: pipeline stage transitions + `stage_events` (`agents/tracker.ts`)
- [x] **Match scoring**: deterministic skill overlap + LLM rationale → `match_scores` (`agents/match.ts`)
- [x] **Dashboard**: Home (KPI cards + agent task feed), Kanban, Resume Studio, Outreach Hub, VVP Workspace
- [x] **WebSocket** live task feed with auth (`ws/index.ts`)
- [x] **Profile seed script** (`scripts/seed-profile.sh`)
- [x] **Company brief display** in Resume Studio expanded row
- [x] **Error states** in all dashboard components
- [ ] **E2E smoke test** — manual: paste real job URL → verify full loop end-to-end *(one-time validation, not a code task)*

## Phase 2 — VVP, Outreach & Contacts ✅ COMPLETE
- [x] **VVP Agent**: two-step propose → generate artifact (`agents/vvp.ts`)
- [x] **Outreach Agent**: draft messages, approval-gated (`agents/outreach.ts`)
- [x] **Contacts CRUD** (`routes/contacts.ts`)
- [x] Dashboard: VVP Workspace + Outreach Hub fully wired
- [ ] **WhatsApp via OpenWA** — deferred (ToS/ban risk; Phase 2 best-effort)
- [ ] Cloud-fallback opt-in toggle in Settings — deferred

## Phase 2.5 — Job board discovery ✅ COMPLETE
Official feeds only — Remotive (JSON API), Remote OK (API), WeWorkRemotely (RSS). No scraping. See `11-JOB-BOARDS.md`.
- [x] Per-board adapters (`agents/lib/boards/`) behind shared interface; 15-min tick polling; dedupe ledger (`job_board_seen`)
- [x] Discovered jobs → `opportunities` (`source_channel=job_board`), Match agent enqueued automatically
- [x] Discovered feed on dashboard (`DiscoveredFeed.tsx`); `GET /opportunities?source=job_board`
- [x] Settings: Job Boards panel — add/toggle/delete boards, keywords filter, poll interval, manual poll-now trigger
- [ ] Daily Telegram chat digest — deferred (requires Telegram bot token configured)

## Phase 3 — Interview, Follow-up & Strategy
- [ ] **Interview Agent**: interview brief + text mock Q&A on reaching interview stage
- [ ] **Follow-up Agent**: 3/7/14-day drafted nudges
- [ ] **Strategist Agent**: targeting + skill-gap advice across the whole pipeline graph
- [ ] Dashboard: Interview Center; pipeline analytics

## Phase 4 — Autonomy (gated, optional, risky) — BUILT, OFF BY DEFAULT
All capabilities ship **disabled** behind a per-action control plane in Settings → Autonomy
(`app_settings.autonomy`). Each agent re-checks the gates before acting (defense in depth).
- [x] **Settings autonomy control plane**: master switches + per-site/-domain allowlists + daily cap
      (`agents/lib/autonomy.ts`, `routes/settings.ts`, `components/settings/AutonomyPanel.tsx`)
- [x] **Apply Agent**: semi-auto apply behind master switch + per-site opt-in + daily limit + human
      confirm (parks in `needs_approval` → `POST /tasks/:id/approve`). Live third-party form POST is a
      deliberately-stubbed seam (`submitToAts`); the gate/limit/audit/state-change are real. (`agents/apply.ts`)
- [x] **CRM enrichment** (low-risk track): public-search contact enrichment, never overwrites owner
      data, never fabricates emails (`agents/enrich.ts`)
- [x] **Scrape Agent** (risky track): careers-page extraction behind master switch + domain allowlist +
      SSRF guard; dedupes via `job_board_seen` (`agents/scrape.ts`)
> Treat as experimental. Auto-apply and scraping carry ban + quality risks; human-in-the-loop is the
> default (requireConfirm on). Compliant job *discovery* via official feeds remains Phase 2.5.
> Wiring a real per-site ATS submitter requires accepting each site's ToS — out of scope here.

## Phase 5 — Production readiness (GATED) — FOUNDATION ONLY
Gate (`12-PRODUCTION-READINESS.md §0`) is **not** formally met, so only the safe, migration-ready
foundation is built. Billing, managed secrets store, rate limiting, scaling, observability, compliance,
and the WhatsApp official-API migration remain deferred until the gate is met.
- [x] **Tenancy**: every new query is `user_id`-scoped; session resolves the acting user.
- [x] **Auth scaffold** (reviewed-before-use, SECURITY.md B3): `users.password_hash` + `sessions` table,
      `POST /auth/register|login|logout` + `GET /auth/me` (scrypt + hashed opaque tokens). The v1
      single-owner bearer token still works; middleware accepts either. (`routes/auth.ts`,
      `lib/password.ts`, `middleware/auth.ts`)
- [ ] Email verification, password reset, lockout, rate limiting — **human-designed, deferred**
- [ ] Managed secrets store + rotation, billing, observability, scaling, compliance — **deferred**

---

## Sequencing advice for Claude Code
1. Lock the **data model + API contract** first — both the agents and Lovable's UI build against it.
2. Build the **Model Router** before any agent, so every agent is local/cloud-agnostic from day one.
3. Ship the **Telegram + Intake + Resume slice** before adding more agents — prove the loop, then widen.
4. Keep each agent's **tools and output schema explicit**; write the task-audit log from the start (it's painful to retrofit).
5. Put the **no-fabrication resume validator** in Phase 1, not later — it's a core trust guarantee.
