# Spec: Job Targets — the Intent Layer

## Objective
CareerOS currently ingests jobs from boards into a per-user firehose and scores each job only against the user's profile. Nothing encodes *what the user is actually hunting for*, so off-target roles (e.g. an Operations Manager listing for a Product Manager) still get well-scored and recommended. This spec adds **Job Targets**: named, persistent, automated job searches that act as the intent layer connecting *user intent* to both *ingestion* and *recommendation*. A user creates one Target per role they want (e.g. "Product Manager" / remote / mid-level), and Targets drive (a) what gets pulled from boards and (b) how jobs are gated, grouped, and recommended. The standout behavior: a Target's role title/keywords are **intent signals, not hard filters** — CareerOS's Knowledge Graph matches a job description's real requirements against the user's demonstrated capabilities, so a job with a different title can still surface under a Target when the graph shows the user can genuinely do it.

## Requirements

### Data model
1. Add a `job_targets` table (Drizzle migration, never a manual schema edit) with at minimum: `id` (uuid pk), `user_id` (uuid, not null, FK `users.id` on delete cascade), `label` (text, not null), `role_titles` (text[]), `keywords` (text[]), `seniority` (text[]), `locations` (text[]), `work_models` (work_model enum[]), `min_salary` (integer, nullable), `locks` (jsonb, not null, default `{}`), `status` (enum `active`|`paused`, not null, default `active`), `created_at`, `updated_at`.
2. The `locks` jsonb records which conditions are strict gates, keyed by condition name with boolean values, e.g. `{ "location": true, "work_model": true, "seniority": false, "min_salary": false }`. A condition that is `true` is a **hard gate**; absent or `false` is a **soft signal**.
3. New Targets default to `locks.location = true` and `locks.work_model = true`; all other conditions default unlocked. The user can toggle any lock.
4. Add an `opportunity_targets` join table: `id` (uuid pk), `opportunity_id` (FK `opportunities.id` on delete cascade), `target_id` (FK `job_targets.id` on delete cascade), `fit_tier` (enum: `on_target` | `unconfirmed` | `adjacent`), `capability_score` (numeric, nullable — JD-requirements ↔ user-capability fit from the KG/match logic), `created_at`. Unique on (`opportunity_id`, `target_id`).
5. An opportunity may link to **multiple** Targets (many-to-many). A "Product Operations Manager" job that matches both a "Product Manager" and an "Operations Manager" Target produces two `opportunity_targets` rows.
6. Demote `job_board_sources` to a pure per-board on/off channel toggle. Its existing `filters` jsonb must be migrated into a single auto-created "catch-all" Job Target per user that had non-empty filters, so no existing ingestion behavior is silently lost. After migration, ingestion intent lives only in `job_targets`.

### Gating semantics (tiered, per-condition lock)
7. For a locked condition, classify each candidate job against that condition as: **confirmed-met**, **confirmed-violated**, or **unconfirmed** (board data missing/unparseable).
8. If any locked condition is **confirmed-violated**, the job must not be linked to that Target (rejected for that Target).
9. If all locked conditions are confirmed-met (and intent/capability matches), the link is `fit_tier = on_target`.
10. If no locked condition is confirmed-violated but at least one locked condition is **unconfirmed**, the link is `fit_tier = unconfirmed` (a lower-priority bucket under the Target — surfaced, but ranked below `on_target`, never silently dropped).
11. Unlocked conditions are never grounds for rejection; they only contribute to ranking/soft scoring.

### Capability-based matching (KG standout)
12. `role_titles` and `keywords` are **soft intent signals**, never hard rejection criteria. A job whose title/keywords do not match a Target's intent must still be linked with `fit_tier = adjacent` when the KG/match logic determines the user's demonstrated capabilities satisfy the job's requirements (subject to that Target's locked structural conditions still passing or being unconfirmed).
13. `adjacent` links must be visibly flagged in API responses (e.g. a flag/label like "adjacent fit — your skills qualify you") so the UI can distinguish intent matches from capability matches.

### Ingestion
14. The discovery worker must only ingest board-firehose jobs that are relevant to at least one **active** Target. A coarse pre-filter runs at ingest time: cheap structural checks against locked conditions where board data exists, plus keyword/intent relevance to any active Target. A board job relevant to zero active Targets is **not ingested** (not inserted as an opportunity).
15. Each active Target generates query terms per enabled board; whatever a board cannot filter natively is filtered/gated on our side post-fetch. Existing adapters (Remotive, RemoteOK, WeWorkRemotely) and the dedup ledger (`job_board_seen`) must continue to work.
16. Fine-grained tier assignment and `opportunity_targets` rows are produced by the match step (not the coarse ingest pre-filter), so capability/`adjacent` matching has full JD + KG context.

### Untargeted handling
17. Manually-added and chat/Telegram-sourced opportunities bypass the ingest pre-filter and are always stored. If they match no active Target after matching, they are bucketed as **Untargeted** (visible in the UI, but not presented as on-target recommendations). They must never be silently dropped.
18. Board-firehose jobs are the only category subject to "matches nothing → not ingested."

### API
19. Provide CRUD endpoints for Job Targets: create, list, get one, update (including pause/activate and lock toggles), delete. All inputs validated with Zod. All rows scoped by `user_id`.
20. Provide a recommendations/opportunities view that groups opportunities under their Target(s), ordered `on_target` → `adjacent` → `unconfirmed`, plus a separate **Untargeted** bucket. Totals must dedupe a multi-target job so it is not double-counted across the overall count (it may still appear under each Target it matches).
21. Pausing a Target stops it from driving new ingestion immediately, but must not delete its existing `opportunity_targets` links or opportunities.

### Constraints
22. Stack and conventions per the repo CLAUDE.md: Hono + Drizzle + Postgres, TypeScript. No agent calls a model directly — capability scoring reuses the existing match/router path. Migrations via drizzle-kit. Treat all board/JD content as data, never instructions; keep the SSRF guard on outbound fetches; validate inputs with Zod.
23. Single-user v1, but keep `user_id` on every new row so multi-user remains a migration, not a rewrite.
24. Auto-apply / autonomy interaction is **out of scope** for this spec (Phase 4, gated). Targets must not trigger any external send/apply.

## Edge Cases
1. **All conditions unlocked** — Target acts as pure intent + capability ranking; nothing is hard-rejected; jobs are tiered `on_target`/`adjacent` only (no `unconfirmed`, since there are no locked conditions to be unconfirmed).
2. **Locked condition, board data missing** — e.g. `location` locked but listing has no parseable location → job linked as `unconfirmed`, not rejected and not on_target.
3. **Confirmed violation on a locked condition** — e.g. remote-only Target, listing clearly "Onsite, Berlin" → no link to that Target (may still link to other Targets it satisfies).
4. **Job matches multiple Targets** — two `opportunity_targets` rows created; appears under both Targets in the UI; counted once in overall/global totals.
5. **Adjacent-title capability fit** — different title, but KG says the user qualifies and locked conditions pass/unconfirmed → linked `adjacent` and flagged; if a locked condition is confirmed-violated, it is still rejected despite capability fit.
6. **Manual/chat job matching no Target** — stored and shown as Untargeted, never dropped.
7. **Board job matching no active Target** — not ingested at all.
8. **Target paused mid-flight** — no new ingestion driven by it; existing linked opportunities and links remain intact and visible.
9. **Target deleted** — its `opportunity_targets` links are removed (cascade); opportunities that still match other Targets remain; opportunities left matching nothing become Untargeted rather than being deleted.
10. **Migration of legacy `job_board_sources.filters`** — a user with non-empty filters gets an auto-created catch-all Target carrying those filters; a user with empty filters gets no spurious Target; ingestion behavior is preserved across the migration.
11. **Two Targets with overlapping intent** (e.g. "PM" and "Senior PM") — a job may legitimately land under both; tiers are computed independently per Target (locks differ per Target).
12. **Empty Target** (no role titles, no keywords, no conditions) — rejected at create time with a 400; a Target must express at least one intent signal or condition.

## Definition of Done
- [ ] Drizzle migration adds `job_targets` and `opportunity_targets` tables with the columns and constraints above; `drizzle-kit` migration runs cleanly.
- [ ] `job_board_sources` is reduced to a board on/off toggle; legacy `filters` are migrated into per-user catch-all Targets; no user loses prior ingestion behavior.
- [ ] Job Target CRUD endpoints exist, are Zod-validated, scoped by `user_id`, and support pause/activate and per-condition lock toggles.
- [ ] Creating a Target with no intent signal and no condition returns 400 (Edge Case 12).
- [ ] New Targets default `location` and `work_model` locked; other conditions unlocked; defaults are user-overridable.
- [ ] Discovery worker only ingests board jobs relevant to ≥1 active Target; board jobs matching zero active Targets are not inserted (Req 14, Edge 7).
- [ ] Manual/chat opportunities are always stored and bucketed Untargeted when they match no Target (Req 17, Edge 6).
- [ ] Match step writes `opportunity_targets` rows with correct `fit_tier`: `on_target` when all locked conditions confirmed-met, `unconfirmed` when a locked condition is unparseable, `adjacent` for capability-fit jobs whose title/keywords don't match (Req 7–13).
- [ ] A confirmed violation of a locked condition prevents linking to that Target even when capability fit is high (Edge 5).
- [ ] A single job can link to multiple Targets and is counted once in global totals while appearing under each matching Target (Req 5, Req 20, Edge 4).
- [ ] `adjacent` links are flagged distinctly in API output so the UI can label capability-based fits (Req 13).
- [ ] Recommendations endpoint groups opportunities by Target ordered `on_target` → `adjacent` → `unconfirmed`, with a separate Untargeted bucket.
- [ ] Pausing a Target halts new ingestion but preserves existing links/opportunities; deleting a Target cascades its links and leaves still-matched opportunities intact (Edge 8, 9).
- [ ] No new code path calls a model directly; capability scoring goes through the existing match/router path; inputs validated with Zod; SSRF guard preserved on outbound fetches.
