# CareerOS — Build Roadmap

Phased so each milestone is independently useful. Build the **vertical slice first**
(one job → one tailored resume, via Telegram) before widening to all agents.

---

## Phase 0 — Foundations (setup)
**Goal:** the skeleton runs and one local model answers.
- Docker Compose: postgres+pgvector, redis, ollama, api, web.
- DB schema + migrations for core entities (`02-ARCHITECTURE.md §4`).
- Model Router with local (Ollama) path + a stub cloud path; logs model choice.
- Hono API + health check; Next.js app shell.
- `.env` wiring; pull one local model and confirm a round-trip completion.
**Done when:** `docker compose up` brings everything up and a test prompt returns from Ollama through the router.

## Phase 1 — Core vertical slice (MVP) — *the most important phase*
**Goal:** paste a job link in Telegram → get a tailored resume + company brief back; see it in the dashboard.
- **Telegram bot** ingress (locked to your user id) → orchestrator.
- **Intake Agent**: URL/text/PDF/image → Opportunity + Company.
- **Research Agent**: sourced Company Brief (SearXNG).
- **Resume Agent**: master profile → tailored version → PDF (with the no-fabrication guardrail + validation step).
- **Cover/Assets Agent**: cover letter / email.
- **Tracker**: pipeline stages, manual moves.
- **Match scoring** vs profile (pgvector).
- **Dashboard**: Home, Opportunities (Kanban/CRM), Resume Studio, Company Intelligence — read/edit everything chat created; live agent task feed via WebSocket.
**Done when:** the < 15-minute link→assets loop works end-to-end on local models, Telegram + dashboard in sync.

## Phase 2 — VVP, Outreach & WhatsApp
- **VVP Agent**: propose angles → generate report/slides (start with Markdown→PDF; add slides next).
- **Outreach Agent**: draft recruiter/HM/founder/referral messages (approval-gated, draft-only).
- **WhatsApp via OpenWA**: same chat loop as Telegram (secondary number; see risk note).
- Dashboard: VVP Workspace, Outreach Hub.
- Cloud-fallback path fully wired + opt-in toggle surfaced.
**Done when:** you can generate a real VVP for a target company and draft outreach, from either chat app.

## Phase 2.5 — Job board discovery (new, small, low-risk)
Official feeds only — Remotive (JSON API), Remote OK (API), WeWorkRemotely (RSS). No scraping. See `11-JOB-BOARDS.md`.
- Per-board source adapters behind one interface; BullMQ repeatable polling; dedupe ledger.
- Discovered jobs land as `opportunities` (`source_channel=job_board`), scored by the existing Match agent.
- "Discovered" feed in the dashboard + opt-in daily chat digest (user chooses what to action).
- Settings: Job Boards panel (toggle boards, filters, frequency, match threshold, per-board mute), with attribution shown.
**Done when:** new matching jobs appear daily in the Discovered feed without any scraping, and you can act on one with the existing pipeline.

## Phase 3 — Interview, Follow-up & Strategy
- **Interview Agent**: interview brief + text mock Q&A on reaching interview stage.
- **Follow-up Agent**: 3/7/14-day drafted nudges.
- **Strategist Agent**: targeting + skill-gap advice across the whole graph.
- Dashboard: Interview Center; analytics on the pipeline.
**Done when:** an opportunity moving to "Interview" auto-produces a brief and you can run a mock.

## Phase 4 — Autonomy (gated, optional, risky)
- Semi-auto apply behind explicit per-site opt-in + human confirm.
- Contact/recruiter CRM enrichment.
> Treat as experimental. Auto-apply and scraping carry ban + quality risks; keep human-in-the-loop.
> Note: compliant job *discovery* via official feeds is already Phase 2.5 — this phase is only the
> riskier scraping/auto-apply track, which stays gated regardless of anything else.

## Phase 5 — Production readiness (GATED — do not build until publishing is a real decision)
Multi-tenancy, real auth, managed secrets + automated rotation, rate limiting, billing, observability,
compliance, and the WhatsApp official-API migration. Full checklist + the gate criteria in
`12-PRODUCTION-READINESS.md`. The architecture is already migration-ready (every row has `user_id`,
secrets are abstracted), so none of this is built in Phases 0–4 — it's documented so the jump is planned.

---

## Sequencing advice for Claude Code
1. Lock the **data model + API contract** first — both the agents and Lovable's UI build against it.
2. Build the **Model Router** before any agent, so every agent is local/cloud-agnostic from day one.
3. Ship the **Telegram + Intake + Resume slice** before adding more agents — prove the loop, then widen.
4. Keep each agent's **tools and output schema explicit**; write the task-audit log from the start (it's painful to retrofit).
5. Put the **no-fabrication resume validator** in Phase 1, not later — it's a core trust guarantee.
