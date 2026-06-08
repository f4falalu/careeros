# CareerOS — Architecture & Agent Design

## 1. System overview

```
                    ┌─────────────────────────────────────────┐
   Telegram ─────►  │                                         │
   WhatsApp ─────►  │            INGRESS LAYER                │
   (OpenWA)         │   Telegram webhook · OpenWA webhook     │
   Web UI   ─────►  │   Hono REST + WebSocket (dashboard)     │
                    └───────────────────┬─────────────────────┘
                                        │  normalized Event
                                        ▼
                    ┌─────────────────────────────────────────┐
                    │          ORCHESTRATOR (Mastra)          │
                    │  routes intent → agent / workflow        │
                    │  manages session memory + task records   │
                    └───────────────────┬─────────────────────┘
                                        │
        ┌──────────────┬───────────────┼───────────────┬──────────────┐
        ▼              ▼               ▼               ▼              ▼
   Intake Agent   Research Agent   Resume Agent    VVP Agent     Outreach Agent
   Cover Agent    Tracker Agent    Interview Agent  Follow-up Agent  Strategist Agent
        │              │               │               │              │
        └──────────────┴───────┬───────┴───────────────┴──────────────┘
                               ▼
                    ┌──────────────────────┐     ┌──────────────────┐
                    │   MODEL ROUTER       │────►│ Ollama (local)   │
                    │  local-first / cloud │     │ Cloud fallback   │
                    └──────────────────────┘     └──────────────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        ▼                      ▼                      ▼
   PostgreSQL + pgvector   Redis (queue/cache)   Object store (resumes, PDFs)
```

## 2. Tech stack (open-source, self-hostable)

| Layer | Choice | Why |
|---|---|---|
| Agent framework | **Mastra** (TS) | TypeScript-native multi-agent framework (agents, workflows, memory, tools, MCP, evals). Native Ollama + a built-in model router (3000+ models). Production-proven (Replit, SoftBank). One language with the frontend. |
| Backend / API | **Hono** (TypeScript) | Fast, lightweight; same runtime as the Mastra agents and the Node WhatsApp gateway. Shared types with the Next.js frontend. |
| Local inference | **Ollama** | One-line model swaps; Llama/Mistral/Qwen; OpenAI-compatible endpoint. |
| Cloud fallback | **OpenRouter / Claude / OpenAI** via the router | Opt-in only; OpenRouter gives one key for many models. |
| DB | **PostgreSQL + pgvector** | Relational career graph + embeddings for semantic match/RAG in one engine. |
| Queue / cache | **Redis** | Async agent jobs, progress events, caching research. |
| Auth (v1) | Single-user token / **Supabase Auth** or **Authelia** if exposed | Trivial for personal; swappable for multi-user later. |
| Web UI | **Next.js + Tailwind + shadcn/ui + React Query** | Matches Lovable's output; WebSocket for live agent task feed. |
| Telegram | **grammY** (Node) | Official Telegram Bot API, TypeScript-native, free. |
| WhatsApp | **OpenWA** (self-hosted gateway) | Open-source, Docker-native, webhooks. ⚠️ see risk note §6. |
| Resume → PDF | **WeasyPrint** or **Playwright** (HTML→PDF) | Full CSS control; reuse web templates. |
| Search tool | **SearXNG** (self-host) or **Tavily** (cheap API) | SearXNG keeps research local/free; Tavily as fallback. |
| Deploy | **Docker Compose** | Whole stack on a laptop or one VPS. |

## 3. The agents

Built as Mastra agents under one orchestrating layer. Each has a narrow job, explicit tools, and writes a **task record** (input, tools, model used, output, cost) for auditability.

| # | Agent | Trigger | Tools | Output | Phase |
|---|---|---|---|---|---|
| 1 | **Intake** | link/text/PDF/image in | web fetch, PDF/OCR parse, extractor | Opportunity + Company records | P1 |
| 2 | **Research** | new company / refresh | search (SearXNG/Tavily), web fetch | Company Brief (sourced) | P1 |
| 3 | **Resume** | "tailor" action | profile store, template, PDF render | Tailored resume version | P1 |
| 4 | **Cover/Assets** | "cover letter" action | profile, brief | Cover letter / email | P1 |
| 5 | **Tracker** | stage change / inbox event | DB | Updated pipeline | P1 |
| 6 | **VVP** | "build VVP" action | search, brief, doc/slide gen | Report / slides / prototype spec | P2 |
| 7 | **Outreach** | "outreach" action | brief, contacts, tone prefs | Drafted messages (approval-gated) | P2 |
| 8 | **Follow-up** | scheduler | DB, outreach | Drafted follow-ups | P3 |
| 9 | **Interview** | interview stage reached | brief, achievements | Interview brief + mock Q&A | P3 |
| 10 | **Strategist** | owner asks / weekly | full graph | Targeting & skill-gap advice | P3 |

**Orchestrator responsibilities:** intent detection from chat, fan-out to agents, hold session/memory, stream progress to chat + dashboard, enforce the approval gate on anything that sends externally.

## 4. Data model (core entities)

```
User (1 in v1)
Company ──< Job(Opportunity) ──< Application ──< StageEvent
   │              │                   │
   │              │                   └──< AssetLink ─► ResumeVersion / CoverLetter / VVP
   │              └──< MatchScore
   └──< Contact ──< OutreachMessage ──< FollowUp
Profile ── MasterResume, AchievementsLibrary, SkillsLibrary, TonePrefs
ResumeVersion (── embedding)         AgentTask (audit log: agent, input, tools, model, cost, status)
CompanyBrief (── embedding, sources[], fetched_at)
Interview ── InterviewBrief, MockSession
```

pgvector embeddings on `ResumeVersion`, `CompanyBrief`, `AchievementsLibrary` power semantic match scoring and RAG into agents.

## 5. Key flows

**Chat intake (the killer loop):**
```
User pastes URL in Telegram
  → Ingress normalizes → Orchestrator
  → Intake Agent (extract) + Research Agent (brief) run async
  → Match Agent scores vs profile
  → Bot replies: "Acme · PM · match 82% · missing: SQL, Tableau
                  1 Tailor resume  2 Build VVP  3 Draft outreach  4 Mark applied"
  → User: "1 3"
  → Resume + Outreach agents run → bot returns PDF + draft messages
  → All records appear live in the dashboard
```

**Model routing:** every agent calls the **Router**, never a model directly. Router picks local vs cloud per §5 of the PRD, logs the choice, and downgrades gracefully if the local model is unavailable.

## 6. Risks & mitigations

- **WhatsApp ban risk:** OpenWA drives unofficial WhatsApp Web automation — against WhatsApp ToS; the number used can be banned. *Mitigation:* use a secondary number for v1; Telegram is the safe primary; treat WhatsApp as best-effort. If publishing, move to official WhatsApp Business API.
- **Scraping/ToS on job boards & LinkedIn:** auto-apply and bulk scraping risk bans and produce low-quality applications. *Mitigation:* manual paste is the v1 path; auto-apply is P4 and gated behind explicit per-site opt-in.
- **Local model quality on long research:** small models hallucinate citations. *Mitigation:* research agent must call a real search tool and cite; cloud fallback auto-engages for long-context synthesis.
- **Resume fabrication:** *Mitigation:* hard guardrail — tailoring reframes only existing profile facts; a validation step rejects any claim not traceable to the master profile.
- **Single point of failure (one VPS):** *Mitigation:* nightly Postgres + object-store backup; stack reproducible via Compose.
