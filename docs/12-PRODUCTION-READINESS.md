# CareerOS — Production Readiness (`12-PRODUCTION-READINESS.md`)

**Status: GATED. Do not build any of this in Phases 0–4.** This is the consolidated "when we publish"
list — everything across the other docs marked "later / multi-user / when published" gathered in one
place so the migration is *planned*, not improvised. It becomes **Phase 5**, and Phase 5 only begins
when publishing is a real, decided thing — not a "might someday."

> **Why gated:** v1 is a single-user personal tool. Building multi-tenant/production machinery now
> means maintaining enterprise scaffolding for an audience of one, while slowing the thing that
> actually matters: a working tool you can validate. The architecture already keeps this a *migration,
> not a rewrite* (see §1), so nothing here is foreclosed by waiting.

---

## 0. The gate (decision criteria to even start Phase 5)
Begin Phase 5 only when **all** are true:
- The single-user tool has real, sustained personal use (it works and you rely on it).
- There is a concrete decision to offer it to others (not a hypothetical).
- You've identified at least a handful of real prospective users.

Until then, this doc is a reference, not a backlog.

---

## 1. What's already migration-ready (no work needed now)
These were designed in deliberately so the jump is clean:
- **Tenancy seam:** every owned row carries `user_id` (`07-SCHEMA.sql`). Single→multi-user is a data
  scoping change, not a schema rewrite.
- **Secrets abstraction:** keys live behind `credentials` + `provider_configs` (`10-SETTINGS.md`), so
  swapping in a managed secrets store is an adapter change.
- **Config-driven everything:** model router, channels, search, providers all read runtime config, not
  hardcoded values.
- **Maturity paths documented:** `SECURITY.md` B2a and `10-SETTINGS.md` already describe the Level 3–4 targets.

---

## 2. Phase 5 checklist (build only after the gate)

### 2.1 Multi-tenancy & data isolation
- Enforce `user_id` scoping on every query (row-level security in Postgres, or a tenant guard in the
  data layer). Audit that no endpoint can read across users.
- Per-user object-store prefixes for resumes/VVP artifacts.
- Per-user vector partitioning or filtering on pgvector queries.

### 2.2 AuthN / AuthZ (human-designed, not agent-designed — SECURITY.md B3)
- Real auth: email/password + OAuth, email verification, password reset, session management.
- RBAC if teams ever exist; at minimum a clean user/account model.
- Move off the v1 single bearer token. Put admin surfaces behind separate auth.

### 2.3 Secrets at production scale (SECURITY.md B2a maturity path)
- Migrate user/provider secrets to a managed store (Doppler / Infisical / AWS Secrets Manager) for
  versioning, audit logs, and rotation APIs.
- Automate dual-key rotation behind a health-checked job (the `credentials.status` active/retiring
  model already supports the zero-downtime swap).
- Push toward short-lived / federated credentials (Level 4: no long-lived secrets).

### 2.4 Billing & quotas (only if monetized)
- Plans, metering, usage caps per user; cloud-inference cost attribution per user (the `agent_tasks.cost_usd`
  audit already provides the raw data).
- Abuse limits so one user can't exhaust shared resources.

### 2.5 Rate limiting & abuse prevention
- Per-user rate limits on agent triggers and API endpoints.
- Backpressure on the agent queue; fair scheduling so one user's bulk job doesn't starve others.
- Bot-ingress abuse handling beyond the v1 allowed-id lock.

### 2.6 Messaging at scale
- **WhatsApp:** migrate off OpenWA (unofficial, ban risk — `02-ARCHITECTURE.md §6`) to the **official
  WhatsApp Business API**. Telegram scales as-is.
- Per-user channel binding and verification.

### 2.7 Scaling the stack
- Separate the API, workers, and web into independently scalable services.
- Managed Postgres (with pgvector) + managed Redis, or self-hosted with HA + backups/PITR.
- Move local inference decisively: either GPU inference servers (vLLM) you host, or lean on cloud for
  non-personal tasks — but the **privacy boundary still forces personal data to a private inference
  path** (`10-SETTINGS.md §5`). Multi-user does not relax that.
- Object store (S3-compatible) for artifacts; CDN for the web app.

### 2.8 Observability & ops
- Centralized logging, metrics, tracing, error tracking (e.g. OpenTelemetry + a backend).
- Uptime monitoring + alerting; health checks on every service.
- Runbooks for incidents; on-call expectations (even if just you).

### 2.9 Compliance & privacy (becomes mandatory with real users' data)
- Privacy policy + ToS; lawful basis for processing personal data.
- Data export & deletion (GDPR-style right to erasure) — the `users ... ON DELETE CASCADE` design helps,
  but verify complete erasure including object store + backups.
- Data residency/retention decisions; DPA with any sub-processors (cloud LLM providers).
- **Re-examine free cloud tiers:** several may train on inputs (`SECURITY.md B7`) — likely unacceptable
  for *other people's* data even for non-personal tasks. Revisit provider choices for a multi-user product.

### 2.10 Supply chain & release hardening (extends SECURITY.md A8/B9)
- Pinned, audited dependencies; SBOM; signed releases.
- Full CI gates enforced on protected branches (SAST, secret scan, dep scan) — already specced, now mandatory.
- Staging environment that mirrors production; no agent access to prod (SECURITY.md B10).

### 2.11 Legal/ToS for integrations
- Re-confirm job-board feed terms at scale (attribution honored, rate respected — `11-JOB-BOARDS.md`).
- Review any auto-apply ambitions against each site's ToS before enabling (stays gated regardless).

---

## 3. What stays out even in Phase 5
- **Auto-apply / scraping** remains its own gated, human-in-the-loop track (Phase 4) regardless of
  publishing — production scale does not make ToS-violating automation acceptable.

---

## 4. Sequencing note
If Phase 5 ever starts, do it in this order: **multi-tenancy + auth → secrets/observability →
rate limiting/scaling → billing/compliance → messaging migration.** Get isolation and identity right
first; everything else assumes them.
