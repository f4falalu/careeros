# CareerOS — Settings & Configuration (`10-SETTINGS.md`)

How runtime configuration works: API keys, providers (OpenRouter etc.), integrations, model routing,
channels, and preferences — all editable from the UI without redeploying. Complements the static
bootstrap env vars in `03-RESOURCES.md` (`.env` is for *boot*; this doc is for *runtime*).

> **Core rule on secrets:** API keys and tokens are **encrypted at rest** and the plaintext is
> **never returned** by any API. The UI shows masked previews (`sk-or-…a1b2`) and a "set/replace"
> action only. This holds even though v1 is single-user — it's cheap now and mandatory if published.

---

## 1. What's configurable (and where it lives)

| Area | Examples | Storage |
|---|---|---|
| **AI providers** | OpenRouter / Anthropic / OpenAI keys, base URLs | `credentials` (encrypted) + `provider_configs` |
| **Model routing** | per-task model picks, `MODEL_TIER`, cloud fallback on/off, monthly cost cap | `app_settings` |
| **Local inference** | Ollama base URL, installed models, embedding model | `app_settings` + probed live |
| **Search** | SearXNG URL or Tavily key | `app_settings` + `credentials` |
| **Channels** | Telegram token + allowed user ids, OpenWA url/key/session | `credentials` + `channel_configs` |
| **Integrations** | Gmail, Google Calendar/Drive (OAuth), n8n webhook, object store (S3) | `integrations` (OAuth tokens encrypted) |
| **Preferences** | default tone, theme (light/dark), follow-up cadence, currency (NGN), timezone | `app_settings` |
| **Privacy** | "never send personal data to cloud" hard switch, data export, wipe | `app_settings` |

---

## 2. Settings UI (maps to `06-DESIGN.md`)

Settings is a left-rail section with tabbed panels, built from the same card system. Tabs:

1. **AI & Models** — providers (add key cards), routing table (per-task local/cloud picker), cloud-fallback master toggle, cost cap + month-to-date spend.
2. **Local Inference** — Ollama status, list/pull models, pick embedding model (warns if dim ≠ schema `vector(768)`).
3. **Channels** — Telegram (token, allowed ids, webhook health), WhatsApp/OpenWA (session QR link, status) with the ToS/ban-risk note from `02-ARCHITECTURE.md §6`.
4. **Integrations** — connect/disconnect cards for Gmail, Calendar, Drive, n8n, S3. Each shows status pill (connected / disconnected / error) and last-sync.
5. **Preferences** — tone default, theme, follow-up cadence, currency, timezone.
6. **Privacy & Data** — cloud-data hard switch, export all data, wipe.

**Provider card pattern (the OpenRouter example):**
```
┌─────────────────────────────────────────────┐
│  OpenRouter                      ● Connected │
│  API key   sk-or-…a1b2          [ Replace ]  │
│  Base URL  https://openrouter.ai/api/v1      │
│  Default model  meta-llama/llama-3.1-70b     │
│  [ Test connection ]              [ Remove ] │
└─────────────────────────────────────────────┘
```
"Test connection" calls `POST /settings/providers/{id}/test` and renders the result inline.

---

## 3. Data model additions (extends `07-SCHEMA.sql`)

```sql
-- Encrypted secrets. Plaintext NEVER stored or returned.
CREATE TYPE credential_kind AS ENUM ('api_key','oauth_token','bearer','basic','webhook_secret');

CREATE TABLE credentials (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label         TEXT NOT NULL,                 -- 'openrouter', 'telegram', 'tavily', ...
    kind          credential_kind NOT NULL,
    ciphertext    BYTEA NOT NULL,                -- AES-GCM(secret) using APP_SECRET-derived key
    nonce         BYTEA NOT NULL,
    last4         TEXT,                          -- masked preview only
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    rotated_at    TIMESTAMPTZ,
    UNIQUE (user_id, label)
);

-- AI provider config (references a credential).
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

-- Channel config (Telegram / OpenWA).
CREATE TABLE channel_configs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    channel         TEXT NOT NULL,               -- 'telegram'|'whatsapp'
    credential_id   UUID REFERENCES credentials(id) ON DELETE SET NULL,
    config          JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {allowed_user_ids, session, base_url, webhook_url}
    enabled         BOOLEAN NOT NULL DEFAULT false,
    status          TEXT NOT NULL DEFAULT 'disconnected', -- disconnected|connected|error
    last_checked_at TIMESTAMPTZ,
    UNIQUE (user_id, channel)
);

-- Third-party integrations (OAuth or webhook).
CREATE TABLE integrations (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind            TEXT NOT NULL,               -- 'gmail'|'gcal'|'gdrive'|'n8n'|'s3'
    credential_id   UUID REFERENCES credentials(id) ON DELETE SET NULL,
    config          JSONB NOT NULL DEFAULT '{}'::jsonb,  -- scopes, webhook url, bucket, etc.
    status          TEXT NOT NULL DEFAULT 'disconnected',
    last_sync_at    TIMESTAMPTZ,
    UNIQUE (user_id, kind)
);

-- Flat key/value app settings (routing, prefs, privacy). One row per user.
CREATE TABLE app_settings (
    user_id         UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    routing         JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {model_tier, cloud_fallback, per_task:{...}, cost_cap_usd}
    inference       JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {ollama_base_url, embedding_model}
    search          JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {provider, searxng_url}
    preferences     JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {tone, theme, followup_cadence, currency, timezone}
    privacy         JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {block_cloud_personal_data: bool}
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Encryption:** symmetric AES-GCM with a key derived from `APP_SECRET` (env). Decryption happens only
in-process when a credential is needed for an outbound call. If `APP_SECRET` rotates, credentials must
be re-entered (documented behavior, not a bug).

---

## 4. API additions (extends `08-OPENAPI.yaml`)

```
GET    /settings                      → full settings (secrets masked)
PATCH  /settings                      → update routing / inference / search / preferences / privacy

GET    /settings/providers            → list provider_configs (keys masked: last4 only)
POST   /settings/providers            → add/update a provider (+ its key); body sets plaintext key, never echoed
POST   /settings/providers/{id}/test  → live connection test → {ok, latency_ms, model_list?}
DELETE /settings/providers/{id}

GET    /settings/channels             → telegram/whatsapp config + live status
PUT    /settings/channels/{channel}   → set token/session/allowed ids; triggers webhook (re)registration
POST   /settings/channels/{channel}/test

GET    /settings/integrations         → list with status + last_sync
POST   /settings/integrations/{kind}/connect    → starts OAuth (returns auth_url) or saves webhook/creds
POST   /settings/integrations/{kind}/disconnect
GET    /settings/integrations/{kind}/callback   → OAuth redirect handler

GET    /settings/models               → Ollama-installed models + configured cloud models
POST   /settings/models/pull          → pull an Ollama model (async AgentTask-style job)

GET    /settings/usage                → month-to-date cost by model_kind/model (from agent_tasks.cost_usd)
```

**Masking contract:** any response containing a credential returns `{label, kind, last4, base_url,
status}` — never `ciphertext` or plaintext. `POST` accepts the plaintext key in the request body
(over TLS) and immediately encrypts it.

---

## 5. How settings drive the Model Router (ties to `09-AGENTS.md §13`)

The Router reads `app_settings.routing` + `provider_configs` at call time (cached, invalidated on
settings change) instead of only `.env`:

1. `routing.cloud_fallback` master switch — if off, Router never escalates regardless of per-agent `allow_cloud`.
2. `routing.per_task` overrides the default tier map per task type (e.g. force resume → cloud).
3. `routing.cost_cap_usd` — if month-to-date cloud spend (summed from `agent_tasks.cost_usd`) exceeds
   the cap, Router refuses cloud and falls back to local, noting it in the task `summary`.
4. `privacy.block_cloud_personal_data` — **hard override**: any task whose input contains personal
   profile data is forced local even if the user opted into cloud for that task. (Privacy beats convenience.)

Precedence (highest first): **privacy block → cost cap → master fallback switch → per-task override → tier default.**

---

## 6. Bootstrap vs runtime (avoid the chicken-and-egg)

- `.env` provides the **minimum to boot**: `APP_SECRET`, `DATABASE_URL`, `REDIS_URL`, `OLLAMA_BASE_URL`.
- Everything else can be **empty at boot** and filled via Settings UI. The app must start with zero
  providers/integrations configured and degrade clearly ("No cloud provider configured — running local only").
- On first run, seed `app_settings` from any `.env` values present (so existing `.env` setups keep working),
  then let the UI take over as the source of truth.

---

## 7. Settings in the chat interface
The bot supports a few inline commands so config isn't dashboard-only:
- `/status` → channels, model in use, MTD spend, cloud on/off.
- `/cloud on|off` → toggle fallback (honors privacy/cost guards).
- `/model <task> <local|cloud>` → quick per-task override.
Sensitive actions (entering keys, OAuth) are **dashboard-only** — never paste keys into a chat.

---

## 8. Guardrails
- Plaintext secrets never logged, never in `agent_tasks`, never returned by the API.
- `TELEGRAM_ALLOWED_USER_IDS` enforced at ingress — an unknown sender is rejected before any agent runs.
- "Test connection" uses a cheap/no-cost probe (e.g. model list endpoint), not a billable completion, where possible.
- Disabling a provider or hitting the cost cap degrades to local gracefully — never a hard failure mid-task.
- OAuth tokens refreshed server-side; refresh failures flip integration `status='error'` and surface in the UI.
