# CareerOS

> AI-native, multi-agent, local-first career operating system.
> Paste a job link into Telegram/WhatsApp → agents research the company, tailor your resume,
> build a value-validation project, draft outreach, and track the application — end to end.

## Planning docs (read in order)
| Doc | What's in it |
|---|---|
| [`docs/00-CONCEPT-NOTE.md`](docs/00-CONCEPT-NOTE.md) | Vision, problem, differentiation, the local-first constraint, v1 scope |
| [`docs/01-PRD.md`](docs/01-PRD.md) | Goals/non-goals, per-module functional requirements (P1–P4), NFRs, model routing policy |
| [`docs/02-ARCHITECTURE.md`](docs/02-ARCHITECTURE.md) | System diagram, stack, the 10 agents, data model, flows, risks |
| [`docs/03-RESOURCES.md`](docs/03-RESOURCES.md) | Model tiering, dependencies, accounts/keys, env vars, repo layout, cost |
| [`docs/04-ROADMAP.md`](docs/04-ROADMAP.md) | Phase 0→4 milestones + sequencing advice |
| [`docs/05-PRIOR-ART.md`](docs/05-PRIOR-ART.md) | What to borrow from the reference repos (JadeAI etc.) |
| [`docs/06-DESIGN.md`](docs/06-DESIGN.md) | Design system: tokens, color, type, components, the AI command layer (from the two dashboards) |
| [`docs/07-SCHEMA.sql`](docs/07-SCHEMA.sql) | PostgreSQL + pgvector DDL for the full career graph |
| [`docs/08-OPENAPI.yaml`](docs/08-OPENAPI.yaml) | OpenAPI 3.1 contract — build Claude Code + Lovable against this |
| [`docs/09-AGENTS.md`](docs/09-AGENTS.md) | Per-agent spec: prompts, tools, Pydantic output schemas, guardrails, tests |
| [`docs/10-SETTINGS.md`](docs/10-SETTINGS.md) | Runtime config: API keys/providers (OpenRouter etc.), integrations, model routing, channels, privacy |
| [`docs/11-JOB-BOARDS.md`](docs/11-JOB-BOARDS.md) | Job-board discovery via official feeds (Remotive, Remote OK, WeWorkRemotely) — no scraping |
| [`docs/12-PRODUCTION-READINESS.md`](docs/12-PRODUCTION-READINESS.md) | GATED Phase 5: the "when we publish" checklist (multi-tenancy, managed secrets, scaling) — not built in v1 |
| [`SECURITY.md`](SECURITY.md) | Security protocol: securing the Claude Code build + the app (secrets, SSRF, injection, privacy) |
| [`CLAUDE.md`](CLAUDE.md) | Operating contract for Claude Code: principles, build order, conventions |

## The one-line architecture
`Chat/Web → Orchestrator (Mastra) → specialized agents → Model Router (Ollama local / cloud fallback) → Postgres+pgvector / Redis`

## Core principles (the short version)
1. Local-first; cloud is opt-in fallback, always via the router.
2. Resumes never fabricate — tailoring reframes real profile facts only.
3. External sends are approval-gated in v1 (drafts only).
4. Every agent run is audited.
5. Single-user now; architected so multi-user is a migration, not a rewrite.

## Start here
1. Read `CLAUDE.md` + `docs/00`–`05`.
2. Confirm the owner's `MODEL_TIER` (hardware) → pick local models in `docs/03`.
3. Build Phase 0 (Compose + DB + Model Router), then the Phase 1 Telegram→resume vertical slice.

## Status
Planning / handoff. No code yet. Builders: **Claude Code** (backend + agents), **Lovable** (dashboard UI).
