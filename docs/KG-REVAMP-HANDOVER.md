# Career Intelligence (KG) Revamp — Handover

**Last updated:** 2026-06-16 · **Branch:** `fix/kg-node-dedup-by-label` · **Status:** 6 slices shipped, uncommitted in working tree. All six missing layers now built.

This document hands over an in-progress revamp of the **Career Intelligence** page
(`/career-intelligence`) from a static React-Flow tree into a graph-native "living career
brain". Read it fully before continuing — it captures decisions, architecture, how to run the
stack, gotchas, and the remaining roadmap.

---

## 1. The mission (owner's vision)

The graph should stop being a widget and become **the product/interface** — Neo4j Bloom /
Memgraph / Palantir Gotham feel. The intelligence derived from the graph is the product, not the
graph. Every click should answer a career question, reveal evidence, expose reasoning, or
recommend an action. Reference blend the owner asked for: **40% Neo4j Bloom** (exploration), **30%
Obsidian graph** (discovery), **20% Perplexity** (explainability), **10% ChatGPT** (NL chat).

Six "missing layers" were identified. Status:

| # | Layer | Status |
|---|-------|--------|
| 1 | **Time / Timeline mode** | ✅ shipped (slice 6 — time-axis layout + scrubber) |
| 2 | **Agent-activity nodes** (Resume Tailored / Outreach / Research as graph events) | ✅ shipped (slice 5) |
| 3 | **Opportunity layer** (match-% nodes, "why am I a match" path) | ✅ mostly done via Copilot + existing backend |
| 4 | **Confidence heatmap** | ✅ shipped |
| 5 | **Career predictions** | ✅ shipped (prediction nodes) |
| 6 | **Graph Copilot** (ask graph → highlight/animate) | ✅ shipped |

---

## 2. Key decisions already made (do not relitigate)

1. **Renderer = Sigma.js v3 + Graphology** (owner's explicit choice, overriding an earlier
   d3-force-on-React-Flow suggestion). Recreate the interaction model; **do not** embed Bloom/Memgraph.
2. **Keep the Postgres graph schema + `GraphService` as-is.** No DB migration for the work done so
   far. (Timeline/agent-layer *will* need schema additions — see §7.)
3. **Keep the existing 5 tabs** (Career Map / Skills / Evidence / Insights / Paths). Only the
   **Career Map** canvas was swapped to Sigma. The other tabs still use their original components.
4. **Non-destructive.** The old React-Flow files are left in place (now unused) rather than deleted.
5. **Copilot is graph-grounded and deterministic** (intent routing over existing primitives) — **no
   LLM dependency** in the hot path, so it's reliable for demos. (Predictions *do* call the LLM with a
   theme-based fallback.)

---

## 3. What was built (4 slices)

### Slice 1 — Sigma.js renderer (`SigmaExplorer.tsx`)
New file `apps/web/src/components/kg/SigmaExplorer.tsx` (~600 lines) replaces the React-Flow canvas.
Same props as the old `KGExplorer`: `{ initialPathTo?, jumpToNodeId?, initialSearch? }`. Reuses the
existing `IntelligencePanel` and **all** `/graph/*` APIs unchanged.
- Force-directed layout: animated ForceAtlas2 (`graphology-layout-forceatlas2`), ~16 rAF frames,
  **user node pinned to origin each frame** so it reads as the centroid. `runLayout(fit)`.
- Dark Bloom canvas (`CANVAS_BG = #0b0f1a`), circular nodes colored by type (`NODE_TYPE_STYLES` from
  `types.ts`), sized by `SIZE_BY_TYPE`.
- Click → select (opens `IntelligencePanel`) + expand (`expandNode` fetches 1-hop subgraph, seeds new
  nodes in a ring around the clicked node, relayouts). Re-click expanded node → `collapseNode`
  (reachability-from-user via `reachableExcluding`, drops only the subtree it exclusively introduced).
- Hover → Bloom focus (highlight node+neighbors, dim rest) via Sigma `nodeReducer`/`edgeReducer`.
- Search highlight, zoom/fit controls (Sigma camera: `animatedZoom/Unzoom/Reset`).

### Slice 2 — Graph Copilot
- **Backend:** `GraphService.askGraph(userId, question)` in `apps/api/src/services/graph.ts` +
  `POST /graph/ask` in `apps/api/src/routes/graph.ts`. Deterministic intent routing:
  `weakness` (getInferences) · `strength_path` (recommendOpportunities + findPath) · `evidence`
  (label match) · `search` (token overlap). Returns
  `{ intent, answer, highlightNodeIds, path, focusNodeId }`. Every answer traces to real nodes.
- **Client:** `api.graph.ask(question)` + `GraphAskResult` type in `apps/web/src/lib/api.ts`.
- **UI:** on-canvas "Ask your career graph" bar + suggestion chips + answer card in `SigmaExplorer`.
  A `path` answer animates the glowing amber path (reuses the path renderer); a highlight-set answer
  dims-to-focus; both auto-open the panel on `focusNodeId`. State: `copilotHighlight`,
  `copilotAnswer`, `handleAsk`. Highlight precedence in reducer: **path > highlight > search > hover > selected**.

### Slice 3 — Confidence heatmap
- Stores raw `conf` on each graphology edge. `computeConfMap()` → per node, evidence strength =
  confidence of its link to the user (fallback: strongest incident edge). `heatColor()` buckets:
  green ≥0.75 / amber ≥0.5 / red <0.5.
- **Heatmap** toggle (top-left). Node reducer applies heat color as base (special states still
  override). Legend swaps to Strong/Medium/Weak. User node + prediction nodes excluded.

### Slice 4 — Career-prediction nodes
- **Backend:** `GET /graph/predictions` → existing `recommendCareerMoves` (LLM w/ theme fallback).
- **Client:** `api.graph.predictions()` + `CareerMove` type.
- **Canvas:** injects predictions as distinct **magenta** (`#ec4899`) ghost nodes (synthetic ids
  `pred:N`, edge ids `prededge:N`) linked to user by faint "PREDICTED" edges, sized by confidence.
  Excluded from heatmap. Click → shows rationale in the answer card (does **not** fetch DB, since
  these ids aren't in Postgres). Legend gets a "predicted" entry.

---

### Slice 5 — Agent-activity nodes (layer #2)
Agent runs become first-class graph events.
- **Schema:** added `agent_activity` to `graphNodeTypeEnum` (`apps/api/src/db/schema.ts`). One node
  type; the specific event is in `attributes.kind` (`resume_tailored` / `match` / `outreach` /
  `research` / `interview_brief` / `vvp_created`). Migration `drizzle/0005_agent_activity_node_type.sql`
  (`ALTER TYPE … ADD VALUE`) + journal entry.
- **Backend:** `GraphService.recordActivity(userId, {kind, label, occurredAt?, opportunityId?,
  companyId?, companyLabel?})` (`services/graph.ts`). Resolves the user node directly (no upsert →
  no duplicate user), inserts the `agent_activity` node with `attributes.{kind, occurredAt}`, links
  `USER -PRODUCED-> activity` and, when the entity is already a node, `activity -FOR-> opportunity`
  (by entityId) or `activity -ABOUT-> company` (by entityId **or** label, since company nodes are
  seeded label-only). Best-effort.
- **Worker:** `recordAgentActivity(jobName, jobData)` in `workers/agentWorker.ts` runs on every
  **succeeded** job via an `ACTIVITY_MAP`. Resolves the opportunity directly (`opportunityId`),
  indirectly (`applicationId`→application, `vvpId`→vvp), or the company (`companyId`), builds a
  `"<verb> · <roleTitle/company>"` label, then calls `recordActivity`. Wrapped in `.catch()` — a
  graph write never fails the task. Jobs not in the map (tracker/followup/intake/…) produce no node.
- **Canvas:** teal (`#14b8a6`) `agent_activity` style in `NODE_TYPE_STYLES`/`SIZE_BY_TYPE`; legend
  "activity" entry; `getEntityPath('agent_activity') → /tasks`. They're real DB rows, so
  click→IntelligencePanel works for free.

### Slice 6 — Timeline mode (layer #1)
A temporal layout + scrubber, toggled on the canvas. **No new renderer** — manual `x,y` + reducer
`hidden`.
- **Backend:** `getSubgraph`/`getNodeDetail` now return `createdAt` (ISO) per node (`SubgraphNode`).
  This is the **fallback** timeline date; real career dates in `attributes.{startDate,endDate,
  occurredAt}` take precedence.
- **Client (`SigmaExplorer`):** every node carries a `tdate` (ms) attribute computed by `nodeDateMs()`
  (`endDate ?? startDate ?? occurredAt ?? createdAt`); prediction ghosts get `now + 1yr` so they sit
  in the future. `runTimeline(fit)` lays nodes out **x = time** (linear across min→max), **y = lane by
  type** (`TIMELINE_LANES`), pins the user at the left edge. `relayout()` picks timeline vs FA2 so
  expand/collapse/predictions respect the active mode. A bottom **scrubber** (`<input type=range>`)
  sets a cutoff date; the node + edge reducers set `hidden` for anything past the cutoff. "Timeline"
  toggle button sits next to "Heatmap".
- `api.ts` `KGNode` gained `createdAt?: string`.

## 4. Files touched (exact inventory)

**Modified (uncommitted):**
- `apps/api/src/services/graph.ts` — added `GraphAskResult` + `askGraph()`; `recordActivity()`;
  `createdAt` on `SubgraphNode` (root, neighbour, and `getNodeDetail` construction sites).
- `apps/api/src/routes/graph.ts` — added `GET /graph/predictions` and `POST /graph/ask`.
- `apps/api/src/db/schema.ts` — added `agent_activity` to `graphNodeTypeEnum`.
- `apps/api/src/workers/agentWorker.ts` — `ACTIVITY_MAP` + `recordAgentActivity()`, called on success.
- `apps/api/drizzle/meta/_journal.json` — journal entry for migration 0005.
- `apps/web/src/lib/api.ts` — added `GraphAskResult` + `CareerMove` types; `api.graph.ask` +
  `api.graph.predictions`; `createdAt?` on `KGNode`.
- `apps/web/src/components/kg/types.ts` — `agent_activity` style + `getEntityPath` entry.
- `apps/web/src/app/career-intelligence/page.tsx` — swapped `KGExplorer` → `SigmaExplorer` via
  `next/dynamic({ ssr: false })` (Sigma touches WebGL at import → SSR crash without this). Removed
  `ReactFlowProvider`. **Tabs unchanged.**
- `apps/web/package.json` / `package-lock.json` — added `sigma`, `graphology`, `graphology-layout-forceatlas2`.

**New:**
- `apps/web/src/components/kg/SigmaExplorer.tsx` — the whole new canvas (now incl. timeline mode).
- `apps/api/drizzle/0005_agent_activity_node_type.sql` — enum migration.

**Unrelated/pre-existing (NOT mine):** `apps/web/src/components/profile/CareerQuestionsSection.tsx`
shows as modified in `git status` but was already dirty before this work — leave it / ask the owner.

**Now-unused (left in place, candidates for deletion once Sigma is validated):**
`apps/web/src/components/kg/{KGExplorer,NodeTypes,EdgeTypes}.tsx`, `layout.ts`. The `reactflow` and
`dagre` deps in `package.json` are now unused too. **Do not delete without owner sign-off** (their
explicit steer was "keep working code").

---

## 5. Data model & API (unchanged backend)

- **`graph_nodes`** (`apps/api/src/db/schema.ts:677`): `id, user_id, type, entity_id, label,
  attributes(jsonb), created_at`. `type` enum: user, skill, experience, project, company,
  opportunity, application, recruiter, interview, goal, interest, resume, vvp, message.
- **`graph_edges`**: `id, user_id, from_node_id, to_node_id, relationship, evidence(jsonb),
  confidence(numeric 4,3), created_at, updated_at`. **No `relationship` enum** — free text.
- **`graph_inferences`**: `id, user_id, type, label, confidence, evidence, computed_at, expires_at`.
  Types used: strength, weakness, interest, theme.
- **`GraphService`** (`apps/api/src/services/graph.ts`): `getSubgraph` (BFS, NODE_CAP=50), `getNodeDetail`,
  `findPath` (bidirectional BFS, ≤1000 edges), `findEvidence`, `findCareerPatterns`,
  `findSkillRelationships`, `findMissingCapabilities`, `recommendOpportunities`,
  `recommendCareerMoves`, `inferStrengths/Weaknesses/Interests/CareerThemes`, `getInferences`,
  `enrich`, and the new `askGraph`.
- **API client surface** (`apps/web/src/lib/api.ts` ~line 296): `api.graph.{subgraph, node, paths,
  gaps, inferences, infer, enrich, ask, predictions}`.

---

## 6. How to run + verify (IMPORTANT — environment is unusual)

**Docker is OFF** in this environment; the project's `.env` uses docker-network hostnames
(`postgres:5432`, `redis:6379`, `ollama:11434`). But **Postgres, Redis, and Ollama are running
natively on localhost**. So the API is booted with inline localhost env overrides (dotenv does NOT
override existing process.env, so `.env` stays untouched):

```bash
# API (runs plain `tsx`, NOT tsx watch → must restart to pick up backend changes)
cd apps/api
DATABASE_URL="postgresql://careeros:careeros@localhost:5432/careeros" \
REDIS_URL="redis://localhost:6379/0" \
OLLAMA_BASE_URL="http://localhost:11434" \
npx tsx src/main.ts        # listens on :8000, soft-fails qdrant/searxng/telegram

# Web (next dev + turbopack, hot-reloads frontend changes)
cd apps/web && npm run dev  # :3000
```

**Auth:** single-user, bearer token = `APP_SECRET` from root `.env`
(`f79ae2f0f456701e2fabb4cff2fae672ec0034d3425a0e13b129b6613391df5f`), baked into the web client as
`NEXT_PUBLIC_APP_SECRET`. Curl example:
`curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/graph/subgraph?depth=2`.

**The Bash tool sandbox blocks localhost** — use `dangerouslyDisableSandbox: true` for any
curl/psql/chrome against local services.

**Demo seed data:** the native Postgres `careeros` DB had a user but **0 graph nodes** (the populated
graph lived in the Docker volume). A representative graph was seeded for user
`6fcdc112-05b5-42d7-a1fc-98a6cff9c4ae`: 17 nodes (Falalu Barde + skills/experience/projects/companies/
goal + an "OpenAI — Product Manager" opportunity), ~32 edges, strength/weakness/theme inferences, and
2 extra themes for deterministic predictions. Seed SQL was `/tmp/careeros-seed.sql` (may be gone on
reboot — regenerate if needed). **To wipe demo data:**
```sql
DELETE FROM graph_edges WHERE user_id='6fcdc112-05b5-42d7-a1fc-98a6cff9c4ae';
DELETE FROM graph_nodes WHERE user_id='6fcdc112-05b5-42d7-a1fc-98a6cff9c4ae';
DELETE FROM graph_inferences WHERE user_id='6fcdc112-05b5-42d7-a1fc-98a6cff9c4ae';
DELETE FROM opportunities WHERE role_title='OpenAI — Product Manager';
```
**Extra demo data added for slices 5–6** (cleared by the same node/edge deletes above):
4 `agent_activity` nodes (research/match/resume_tailored/outreach, Apr–May 2026) linked to the
OpenAI opportunity, and `attributes.startDate/endDate` written onto the Omdena/NextBrain experience &
company nodes so Timeline mode shows a 2019→2025 spine instead of everything bunched at seed time.
These were created by calling `GraphService.recordActivity` + a couple of `UPDATE graph_nodes … SET
attributes = attributes || '{...}'::jsonb` statements; reseed by repeating those if the DB is wiped.

**Applying the enum migration to a fresh/native DB:** the new node type needs
`ALTER TYPE "public"."graph_node_type" ADD VALUE IF NOT EXISTS 'agent_activity';` (idempotent), or
`npm run db:migrate`. The running API was restarted after the ALTER so it picks up `recordActivity`.

**Screenshots (no Playwright/Puppeteer installed):** use macOS Chrome headless.
- Simple: `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new
  --enable-unsafe-swiftshader --use-gl=angle --use-angle=swiftshader --window-size=1600,1000
  --virtual-time-budget=11000 --user-data-dir=/tmp/cros-X --screenshot=/tmp/out.png
  http://localhost:3000/career-intelligence` (SwiftShader needed for WebGL in headless).
- Interactive (drive the copilot): launch with `--remote-debugging-port=9222`, then a Python
  `websockets` CDP script. Sigma nodes are canvas pixels (not DOM) — drive UI by clicking DOM
  buttons by `textContent` via `Runtime.evaluate`; you cannot `querySelector` a graph node.
  Working scripts were at `/tmp/cdp_shot.py` and `/tmp/cdp_heat.py`.

---

## 7. Gotchas & tech debt (read before coding)

- **API has no watch** — backend edits require killing/restarting `tsx src/main.ts`. (Frontend
  hot-reloads.) `/graph/ask` worked first try only because it was written before the API booted;
  `/graph/predictions` 404'd until restart.
- **SSR + WebGL:** Sigma must be loaded client-only (`next/dynamic ssr:false`). Already done.
- **Graphology rejects parallel same-direction edges** — `SigmaExplorer` guards with
  `graph.hasEdge(source,target)` (one visual line per directed pair). The `IntelligencePanel` still
  fetches all relationships from the API, so no evidence is lost on the canvas.
- **Copilot highlights only nodes already loaded** in the canvas. At `depth:2` (current initial load)
  the seeded graph is fully present, but for large real graphs a highlight target outside the loaded
  subgraph won't appear until expanded. Consider auto-expanding `focusNodeId` / `highlightNodeIds`.
- **"Why am I a strong candidate?" path is only 2 hops** (user→opportunity) because the seed has a
  direct `TARGETS` edge that short-circuits `findPath`. With richer data it'd traverse
  user→skill→opportunity. Seed artifact, not a code bug.
- **Pre-existing API typecheck errors** in `intake.ts`, `research.ts`, `telegram.ts`, `main.ts`,
  `orchestrator/index.ts` — unrelated to this work; the API runs via `tsx` which ignores them.
  The graph files compile clean. Web `tsc --noEmit` is **clean**.
- **Baileys/WhatsApp** spams reconnect logs at boot (no `TELEGRAM_BOT_TOKEN`, WA not paired) — noisy
  but non-fatal.
- **`NODE_CAP = 50`** server-side caps subgraphs; the "Showing N connections" notice surfaces it.

---

## 8. Remaining roadmap (next slices)

**Both items below are now SHIPPED (slices 5 & 6).** Kept for reference + follow-ups.

### A. Agent-activity nodes (layer #2) — ✅ DONE (slice 5)
Make agent runs first-class graph nodes (Resume Tailored, Interview Brief, Outreach Campaign, VVP
Created, Company Research). Implementation sketch:
- The enum already has `resume, vvp, interview, message`. Likely add `agent_task`/`research`/`outreach`
  to `graphNodeTypeEnum` (Drizzle migration) OR reuse existing types with attributes.
- Agents write nodes/edges via the existing `GraphService.enrich(userId, {nodes, edges})` when an
  `AgentTask` succeeds (see `apps/api/src/workers/agentWorker.ts`). Edge e.g. `USER -PRODUCED-> ResumeTailored -FOR-> Opportunity`.
- Add colors/sizes for the new types in `NODE_TYPE_STYLES` (`types.ts`) — `SigmaExplorer` reads it.
- These nodes are real DB rows, so click→IntelligencePanel works for free; give them a `getEntityPath`.

### B. Timeline mode (layer #1) — ✅ DONE (slice 6)
Built as described below. **Follow-ups worth doing:** (1) the timeline currently uses one date per
node (end-of-range); a true Gantt-style span (start→end bar) per experience would read better;
(2) precise year-tick axis labels mapped to camera coords (today the scrubber shows min/cutoff/max
only); (3) most non-dated nodes (skills/projects/goal/opportunity) fall back to `createdAt` and
cluster at "now" — backfill real dates (via `graph-backfill.ts`) for a richer spine.

Original sketch:
- Nodes have `created_at` but no **career chronology** (the 2018→2025 progression). Need a date on
  experience/skill/project nodes (e.g., `attributes.startDate`/`endDate`, or derive from the
  `work_experiences` table the experience nodes mirror).
- Add a "Timeline" view toggle in `SigmaExplorer` that switches ForceAtlas2 for a **time-axis layout**
  (x = time, y = lane by type) and a scrubber that filters nodes by date. Sigma supports manual
  `x,y` positioning + `hidden` reducer flag for filtering — no new renderer needed.
- This is where CareerOS becomes unique; budget for a proper design pass.

### Other follow-ups
- Decide whether to delete the unused React-Flow files + `reactflow`/`dagre` deps (owner sign-off).
- Consider committing this work (currently all uncommitted on `fix/kg-node-dedup-by-label`).
- Full-canvas shell: owner wanted the graph more edge-to-edge; the page header/tab chrome still sits
  above the canvas. Could reclaim that space (they said "keep tabs for now", so non-destructive).

---

## 9. Verified-working evidence

All six slices were screenshotted live (headless Chrome against the running stack):
1. Force-directed canvas with Falalu Barde centroid + colored nodes + legend.
2. Copilot "What's holding me back?" → grounded answer + dim-to-focus + panel on the gap node.
3. Copilot "Why am I a strong candidate?" → amber path glow + Evidence Path panel.
4. Heatmap toggle (green/amber/red + legend swap) and magenta prediction nodes.
5. **Agent-activity:** four teal `agent_activity` nodes (research/match/resume/outreach) linked to the
   OpenAI opportunity, with "activity" in the legend (`/tmp/kg-default.png`).
6. **Timeline:** time-axis lanes with "you" pinned left + scrubber w/ date labels
   (`/tmp/kg-timeline.png`); scrubbing to Mar 2024 correctly hides all later nodes/edges
   (`/tmp/kg-timeline-scrub.png`).

Web `tsc --noEmit` → exit 0 after every slice (incl. slices 5–6). API: the graph/worker/schema files
compile clean; the ~20 remaining `tsc` errors are all in the pre-existing set (intake/research/
telegram/main/orchestrator/assets + the BullMQ connection cast) and the API runs via `tsx`.
Endpoints verified via curl: `/graph/subgraph` now carries `createdAt` + the `agent_activity` nodes
with PRODUCED/FOR edges; `recordActivity` exercised directly against the live DB.
