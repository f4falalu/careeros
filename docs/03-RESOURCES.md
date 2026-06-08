# CareerOS — Resources & Dependencies

## 1. Local model tiering (decide once hardware is confirmed)

Hardware is TBD; pick the row matching the final machine. All run via **Ollama**.

| Tier | Hardware | Intake/extract | Resume/cover | Research/VVP (reasoning) |
|---|---|---|---|---|
| **A — Strong** (16GB+ VRAM) | desktop GPU / 24GB+ unified | `qwen2.5:7b` / `llama3.1:8b` | `qwen2.5:14b` | `qwen2.5:14b`/`32b`, fallback cloud |
| **B — Modest** (8GB VRAM / Apple 16GB) | most laptops | `llama3.2:3b` | `qwen2.5:7b` | `qwen2.5:7b` → **cloud for long context** |
| **C — CPU / low-end** | no usable GPU | `llama3.2:3b` (slow) | small + **cloud opt-in** | **cloud fallback primary** |
| **VPS** | rented CPU box | small local for cheap tasks | cloud for the rest | cloud |

> Note: exact best models shift fast — verify current Ollama library tags at build time rather than hard-coding. Treat the above as the *class* of model, not a permanent pin.

**Cloud fallback options (opt-in, pay-per-use):** OpenRouter (one key, many models — simplest), or direct Anthropic / OpenAI keys. Router selects per the PRD policy.

## 2. Software dependencies

### Backend / Agents (TypeScript — Node 20+)
```
hono, @hono/node-server          # API
@mastra/core                     # agent framework (agents, workflows, memory, tools, MCP)
ai, @ai-sdk/openai-compatible    # ONE provider pattern → Ollama (local) + Groq/OpenRouter (cloud)
drizzle-orm + drizzle-kit, postgres   # DB access + migrations (or postgres.js raw)
ioredis, bullmq                  # async agent jobs / queues
grammY                           # Telegram Bot API (TS-native)
zod                              # agent output schemas (replaces Pydantic)
playwright OR puppeteer          # resume/VVP HTML→PDF rendering
pdf-parse / unpdf                # JD PDF parsing (Node)  — escalate to Python sidecar if insufficient
tesseract.js                     # screenshot/JD OCR (or a vision model via Ollama)
cheerio, @mozilla/readability    # readable web extraction
```

### Optional Python sidecar (added later, only if Node parsing is insufficient)
```
fastapi, uvicorn[standard]       # tiny HTTP service, ONE job: document parsing
pdfplumber, pypdf, pytesseract   # heavier-duty PDF/OCR
# No agents here — the TS layer calls this over HTTP as a tool. Not part of Phase 0.
```

### Frontend (Next.js)
```
next, react, typescript
tailwindcss, shadcn/ui, lucide-react
@tanstack/react-query
native WebSocket client (live agent task feed)
recharts (pipeline analytics)
```

### Infrastructure (Docker Compose services)
```
postgres (with pgvector extension)
redis
ollama                    # GPU passthrough where available
searxng                   # self-hosted meta-search for the research agent
openwa                    # self-hosted WhatsApp gateway (rmyndharis/OpenWA)
api  (Hono + Mastra agents + workers, TypeScript)
web  (Next.js)
# parser (optional Python FastAPI sidecar — add later if needed)
```

## 3. External accounts / keys needed

| Service | Required? | Cost | Purpose |
|---|---|---|---|
| Telegram Bot token | **Yes (P1)** | Free | Primary chat interface (via @BotFather) |
| OpenWA (self-hosted) | P2 | Free | WhatsApp gateway — runs in your stack, no account |
| OpenRouter **or** Anthropic/OpenAI key | Optional | Pay-per-use | Cloud fallback only |
| Tavily key | Optional | Free tier | Search fallback if not self-hosting SearXNG |
| A VPS (e.g. Hetzner/DO) | If not self-hosting at home | ~$5–20/mo | Always-on bot + dashboard |
| Domain + TLS | Optional | ~$1/mo | Public dashboard / webhooks (or use a tunnel) |

**Webhook exposure for dev:** Telegram/OpenWA need a public HTTPS endpoint. Use `cloudflared` or `ngrok` locally; a tunnel or reverse proxy (Caddy/Traefik) in production.

## 4. Environment variables (`.env.example`)

```bash
# --- App ---
APP_ENV=dev
APP_SECRET=change-me
PUBLIC_BASE_URL=https://your-tunnel.example.com

# --- Database ---
DATABASE_URL=postgresql+psycopg://careeros:careeros@postgres:5432/careeros
REDIS_URL=redis://redis:6379/0

# --- Models ---
OLLAMA_BASE_URL=http://ollama:11434
MODEL_TIER=B                       # A | B | C | VPS  (selects local model set)
CLOUD_FALLBACK_ENABLED=false       # opt-in
CLOUD_PROVIDER=openrouter          # openrouter | anthropic | openai
OPENROUTER_API_KEY=
ANTHROPIC_API_KEY=
OPENAI_API_KEY=

# --- Search ---
SEARCH_PROVIDER=searxng            # searxng | tavily
SEARXNG_URL=http://searxng:8080
TAVILY_API_KEY=

# --- Telegram ---
TELEGRAM_BOT_TOKEN=
TELEGRAM_ALLOWED_USER_IDS=         # lock the bot to your own user id(s)

# --- WhatsApp / OpenWA ---
OPENWA_ENABLED=false
OPENWA_BASE_URL=http://openwa:2785
OPENWA_API_KEY=
OPENWA_SESSION=careeros
```

## 5. Repo layout (suggested)

```
careeros/
├── docker-compose.yml
├── .env.example
├── docs/                      # these handoff docs
├── apps/
│   ├── api/                   # Hono API + Mastra agents + workers (TypeScript)
│   │   ├── src/
│   │   │   ├── agents/        # one Mastra agent per module
│   │   │   ├── orchestrator/
│   │   │   ├── router/        # model router (local↔cloud, OpenAI-compatible)
│   │   │   ├── channels/      # telegram (grammY) + whatsapp (OpenWA) ingress
│   │   │   ├── db/            # drizzle schema/migrations against 07-SCHEMA.sql
│   │   │   └── main.ts
│   └── web/                   # Next.js dashboard (Lovable-scaffolded)
└── data/                      # postgres, ollama models, resume objects (gitignored)
```

## 6. Cost summary

- **Pure local (Tier A/B, Telegram only):** ~$0/month.
- **Always-on VPS + Telegram:** ~$5–20/month.
- **With cloud fallback used occasionally:** + a few dollars/month pay-per-use.
- **No mandatory SaaS subscription anywhere in the core loop.**
