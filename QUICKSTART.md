# Phase 0 — Quickstart (TypeScript stack)

Goal: stack up, `/health` green, one local-model round-trip. ~10 min (plus model download).

**Stack:** Hono + Mastra (TypeScript) API · Postgres+pgvector · Redis · Ollama · Next.js (Phase 1).
Local + free-cloud models go through ONE OpenAI-compatible provider pattern (Ollama exposes `/v1`,
and Groq/OpenRouter are OpenAI-compatible too) — this sidesteps the ai-sdk Ollama-provider churn.

## On your machine
```bash
# 0. Prereqs: Docker + Docker Compose. (GPU optional — see compose comments.)
cp .env.example .env          # edit APP_SECRET; set MODEL_TIER to match your hardware

# 1. Bring up the stack (postgres auto-loads docs/07-SCHEMA.sql on first boot)
docker compose up -d --build

# 2. Pull one small local model (free, private, runs on modest hardware)
docker compose exec ollama ollama pull llama3.2:3b

# 3. Check health — expect db/redis/ollama all true, model listed
curl -s localhost:8000/health | python3 -m json.tool

# 4. Prove the local round-trip through the Model Router
curl -s -X POST localhost:8000/dev/llm-roundtrip \
  -H 'content-type: application/json' \
  -d '{"prompt":"Reply with exactly: CareerOS is alive."}' | python3 -m json.tool
#   → {"text":"CareerOS is alive.", "modelKind":"local", "modelName":"llama3.2:3b", ...}
```

If `/health` shows `ollama:true` and the round-trip returns `modelKind:"local"`, **Phase 0 is done.**

## Model strategy (free + private)
- **Local (Ollama)** — free, fully private. Default for ALL personal data (resume, contacts, history).
- **Free cloud (Groq / Gemini)** — free, NOT guaranteed private. Opt-in, for non-personal tasks like
  company research (public web data). Add a key in `.env`, set `CLOUD_FALLBACK_ENABLED=true`.
- `BLOCK_CLOUD_PERSONAL_DATA=true` forces anything personal to local even when fallback is on.

## Stack split (TS spine + optional Python sidecar)
- **TypeScript owns the system:** API, Mastra agents, orchestrator, model routing, Telegram + OpenWA, Next.js UI.
- **Python is an OPTIONAL sidecar, added later only if needed** — a small FastAPI service the TS API
  calls over HTTP for PDF/OCR parsing, if Node's PDF libs prove insufficient. Not in Phase 0.
  Agents never live in Python; it's just a tool they can call.

---

# Hand this to Claude Code to continue

> Read `CLAUDE.md` and `docs/00`–`10` in order. Phase 0 scaffolding exists (Docker compose; Hono API
> with `/health`; Mastra-ready Model Router using the OpenAI-compatible provider for Ollama + free
> cloud; schema auto-load). Confirm Phase 0 runs, then begin **Phase 1** per `docs/04-ROADMAP.md`:
> lock the API contract from `docs/08-OPENAPI.yaml`, wire DB access to `docs/07-SCHEMA.sql` (use Drizzle
> or postgres.js), scaffold Mastra agents per `docs/09-AGENTS.md` (Zod output schemas, every agent calls
> the Model Router — never a model directly — and writes an `agent_tasks` audit row), then build the
> vertical slice: Telegram → Intake → Research → Resume(+no-fabrication validator) → Tracker → dashboard.
> Honor the guardrails in `CLAUDE.md` (no resume fabrication, draft-only outreach, privacy-first routing).
> Add the Python PDF/OCR sidecar only if Node parsing proves insufficient.
