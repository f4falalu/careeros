# CareerOS — Job Board Integration (`11-JOB-BOARDS.md`)

How CareerOS *discovers* jobs (vs. the manual-paste intake in `01-PRD.md`). The rule that shapes
everything here: **use official APIs and RSS/JSON feeds only — never scraping.** Several remote boards
publish free, attribution-only feeds built for exactly this, so discovery is ToS-compliant and zero-cost.
This is distinct from (and replaces the vague Phase-4 "autonomous job search" footnote for) the
compliant subset of discovery.

> **Hard line:** no LinkedIn/Indeed scraping, no headless-browser harvesting, no paid scraper actors
> (Apify et al.) in the core product. Those carry ban + ToS risk and are explicitly out of scope.
> If a board offers no official feed, it is not integrated — full stop.

---

## 1. Sources (official, free, allowlisted)

| Board | Method | Auth | Notes |
|---|---|---|---|
| **Remotive** | Public JSON API + RSS | None | `https://remotive.com/api/remote-jobs` (filter by `category`, `search`). Built for aggregation. |
| **Remote OK** | Public API + RSS + JSON feed | None | `https://remoteok.com/api` — first element is legal/attribution metadata, skip it. Attribution required. |
| **WeWorkRemotely** | Public RSS (per-category) | None | Category feeds (programming, devops, design, product, marketing, finance, support). **Attribution back to WWR is required.** |
| *(extensible)* | Any board with an official feed | — | Add via the same adapter interface. No-feed boards are not added. |

**Compliance obligations baked in:** honor each board's attribution requirement (store + display the
source and a link back), respect any rate guidance, and cache so we poll politely (see §4).

---

## 2. Where it sits in the architecture

A new **Discovery** subsystem feeds the existing pipeline — it does not bypass it:

```
Board feeds (Remotive / RemoteOK / WWR RSS)
        │  poll on schedule (BullMQ repeatable job)
        ▼
   Source Adapter (per board) ──► normalize ──► dedupe ──► Opportunity (source_channel='job_board')
        │                                                        │
        │                                                        ▼
        └────────────────────────────────────►  Match Agent scores vs profile
                                                                 │
                                                   score ≥ threshold? ──► surface in
                                                   "Discovered" feed + optional chat digest
```

Key point: discovered jobs land as the **same `opportunities` records** as pasted ones (just
`source_channel='job_board'`), so all downstream agents (research, resume, VVP) work unchanged. The
only new work is fetching + normalizing + deduping + an opt-in surfacing step.

---

## 3. Data model additions (extends `07-SCHEMA.sql`)

```sql
-- Configured board sources + saved searches.
CREATE TABLE job_board_sources (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    board         TEXT NOT NULL,                 -- 'remotive'|'remoteok'|'weworkremotely'
    enabled       BOOLEAN NOT NULL DEFAULT true,
    filters       JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {category, keywords[], min_salary, regions[]}
    poll_interval_minutes INT NOT NULL DEFAULT 360,
    last_polled_at TIMESTAMPTZ,
    UNIQUE (user_id, board, filters)
);

-- Dedupe ledger: remember external ids we've already ingested.
CREATE TABLE job_board_seen (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    board         TEXT NOT NULL,
    external_id   TEXT NOT NULL,                 -- board's job id, or hash(url+title+company)
    opportunity_id UUID REFERENCES opportunities(id) ON DELETE SET NULL,
    seen_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, board, external_id)
);
```

`opportunities.source_channel` already includes a `job_board`-style value — add `'job_board'` to the
`source_channel` enum in `07-SCHEMA.sql` if not present, and store the board name + attribution link in
the opportunity's `source_url`.

---

## 4. Adapter contract (TypeScript)

Each board is one small adapter implementing a common interface, so adding boards is additive:

```typescript
interface JobBoardAdapter {
  board: string;
  // Fetch raw listings honoring filters; throws on transport error (caller retries w/ backoff).
  fetch(filters: BoardFilters): Promise<RawListing[]>;
  // Map a raw listing to our normalized shape + a stable external id for dedupe.
  normalize(raw: RawListing): { externalId: string; job: NormalizedJob; attribution: Attribution };
}

interface NormalizedJob {
  companyName: string; roleTitle: string; location?: string;
  workModel: "remote" | "hybrid" | "onsite" | "unknown";
  salaryText?: string; requiredSkills: string[]; description: string;
  applyUrl: string; postedAt?: string;
}
interface Attribution { board: string; sourceUrl: string; required: boolean; }
```

**Polling:** BullMQ repeatable jobs per `job_board_sources` row at `poll_interval_minutes`. Each run:
fetch → normalize → check `job_board_seen` → insert new `opportunities` + `job_board_seen` rows →
enqueue Match scoring. Backoff + jitter on errors; never hammer a feed.

---

## 5. Surfacing (opt-in, not noisy)

Discovered jobs are **not** auto-actioned. They appear in a **"Discovered"** column/feed in the
dashboard, and — if the user enables it — a **daily chat digest**:

```
🔎 5 new matches today (score ≥ 70)
1. Acme · Senior PM · 84% · remote · via Remotive
2. Globex · Data Analyst · 78% · remote · via WeWorkRemotely
Reply a number to research + tailor, or /mute <board>.
```

The user still chooses what to act on. No resume is generated, no application created, until the user
picks one — same approval-respecting philosophy as the rest of the system.

---

## 6. API additions (extends `08-OPENAPI.yaml`)

```
GET    /job-boards/sources              → list configured sources + status
POST   /job-boards/sources              → add a source (board + filters + interval)
PATCH  /job-boards/sources/{id}         → enable/disable, edit filters
DELETE /job-boards/sources/{id}
POST   /job-boards/sources/{id}/poll    → poll now (manual trigger; async job)
GET    /opportunities?source=job_board&min_score=70   → the "Discovered" feed (reuses existing list)
```

Settings UI: a **Job Boards** panel under Settings (or its own nav item) — toggle boards, set filters
(category, keywords, min salary, regions), set poll frequency, set the match-score threshold for the
digest, and a per-board mute. Each board card shows attribution + last-poll status.

---

## 7. Roadmap placement (updates `04-ROADMAP.md`)

Move the *compliant* slice of discovery earlier and split it clearly from the risky part:

- **Phase 2.5 (new, small):** Remotive + Remote OK + WWR adapters, polling, dedupe, "Discovered" feed,
  daily digest. Low risk (official feeds), high daily value. Reuses Match + the existing pipeline.
- **Phase 4 (unchanged, still gated):** anything requiring scraping, headless browsers, or auto-apply.
  Remains experimental, human-in-the-loop, per-site opt-in — and is NOT how the boards above are accessed.

---

## 8. Guardrails
- **Official feeds only.** A board with no official API/RSS is not integrated. No scraping fallback.
- **Attribution honored** for every board that requires it (stored + shown, link back to source).
- **Polite polling**: scheduled, cached, backoff + jitter; respect documented rate limits.
- **Discovery ≠ action**: discovered jobs surface for the user to choose; nothing is auto-applied.
- **Dedupe** on stable external ids so the same posting never spams the feed.
- If a board changes terms or asks aggregators to stop, the adapter is disabled — compliance over coverage.
