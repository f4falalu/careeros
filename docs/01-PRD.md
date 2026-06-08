# CareerOS — Product Requirements Document (PRD)

**Version:** 0.1 (handoff draft) · **Owner:** Falalu · **Target builders:** Claude Code (backend/agents), Lovable (web UI scaffold)

---

## 1. Goals & non-goals

### Goals (v1)
- Single-user, self-hosted career OS.
- Chat-first: Telegram + WhatsApp as primary input surfaces; web dashboard as the "review & manage" surface.
- Multi-agent backend, local-model-first with cloud fallback.
- Persistent career graph (companies, jobs, contacts, applications, resumes, projects all linked).

### Non-goals (v1)
- Multi-tenancy, billing, team features.
- Mobile native app (PWA only if needed).
- Fully autonomous auto-apply to job boards (Phase 4, gated — high risk of platform bans & bad applications).
- Browser-automation scraping of LinkedIn at scale (ToS + ban risk; manual paste covers the personal use case).

---

## 2. Personas

- **Primary — The Operator (owner):** technically capable, wants to paste a link and get assets back. Lives in chat apps. Reviews/edits in the dashboard.
- *(Future)* **The Job Seeker (public user):** non-technical; would need hosted infra, onboarding, billing. Out of scope for v1 but architecture must not preclude it.

---

## 3. Functional requirements by module

Each requirement is tagged `[P1]` (MVP), `[P2]`, `[P3]`, `[P4]` to map to the roadmap.

### 3.1 Job Intake
- `[P1]` Accept a job via: URL, pasted text, PDF, or screenshot (image).
- `[P1]` Extract structured fields: company, role, location, seniority, required skills, nice-to-haves, salary (if present), work model (remote/hybrid/onsite), visa/sponsorship signal, application URL.
- `[P1]` Create an **Opportunity** record and link/create the **Company**.
- `[P2]` Compute a **match score** vs. the owner's master profile and surface missing skills.
- Acceptance: paste a real job URL → Opportunity created with ≥ 8 fields populated, < 30s on local model.

### 3.2 Company Intelligence
- `[P1]` Generate a **Company Brief**: business model, products, funding/stage, competitors, leadership, recent news, culture signals, hiring signals.
- `[P1]` Cite sources for every factual claim (research agent must use a web-search tool, not memory).
- `[P2]` Cache & refresh briefs; flag stale ones (> 30 days).
- Acceptance: brief contains dated, sourced claims; no fabricated funding/leadership facts.

### 3.3 Resume Studio
- `[P1]` Store a **Master Resume** + structured **Achievements Library** and **Skills Library**.
- `[P1]` Generate a **tailored resume version** per opportunity (ATS-optimized, keyword-aligned, quantified, re-narrated — never fabricating experience).
- `[P1]` Export to PDF and editable format (Markdown/JSON → rendered).
- `[P2]` Version history per opportunity (`resume_v3_acme_pm`).
- **Guardrail:** the resume agent must not invent employers, dates, or credentials. Tailoring = reframing real content only.
- Acceptance: generated resume contains only facts traceable to the master profile.

### 3.4 Cover Letter & Application Assets
- `[P1]` Generate cover letter / application email / recruiter note using company brief + JD.
- `[P2]` Tone presets (formal, warm, direct) tied to owner preference.

### 3.5 Value Validation Project (VVP) — *differentiator*
- `[P2]` Given company + role, propose 2–3 VVP angles (mini audit, growth strategy, automation idea, market analysis, product improvement, analytics dashboard).
- `[P2]` Generate the chosen artifact: structured report (Markdown/PDF), slide outline, or — for technical roles — a prototype spec.
- `[P3]` Role-aware templates (PM → feature opportunity analysis; Eng → architecture proposal; Data → dashboard spec).
- Acceptance: VVP references real, sourced company facts and maps to the role's actual responsibilities.

### 3.6 Application Tracker (Career CRM)
- `[P1]` Pipeline stages: Saved → Applied → Assessment → Interview → Final → Offer → Rejected/Withdrawn.
- `[P1]` Kanban + list views; each card links to its company, resume version, assets, contacts.
- `[P1]` Manual stage changes; `[P2]` agent-suggested stage changes from inbox events.
- Acceptance: every opportunity is one record moving through stages; no spreadsheet needed.

### 3.7 Outreach Hub
- `[P2]` Draft recruiter / hiring-manager / founder / referral messages using research + tone prefs.
- `[P2]` Track sent/replied state per contact.
- `[P3]` Follow-up scheduler (e.g. 3/7/14-day nudges) that drafts the follow-up.
- **Guardrail:** drafts only — owner approves before anything sends in v1. No silent automated sending.

### 3.8 Interview Center
- `[P3]` On interview stage, generate an **Interview Brief**: company recap, role focus, likely questions, STAR answers from achievements library, technical topics.
- `[P3]` Mock-interview Q&A loop (text); voice optional later.

### 3.9 Messaging Interface (chat-first)
- `[P1]` **Telegram bot**: paste link/text/image → agents run → reply with summary + numbered action menu (e.g. "1 Tailor resume · 2 Build VVP · 3 Draft outreach · 4 Mark applied"). Owner replies with numbers to trigger.
- `[P2]` **WhatsApp** via self-hosted OpenWA gateway, same interaction model.
- `[P1]` Long-running agent work runs async; bot sends progress + final artifacts (PDF as document, brief as message).
- Acceptance: full intake→menu→action loop works in Telegram on local models.

### 3.10 Web Dashboard
- `[P1]` Views: Home (pipeline summary, agent task feed), Opportunities (Kanban/CRM), Resume Studio, Company Intelligence, (P2) VVP Workspace, Outreach Hub, Interview Center.
- `[P1]` Everything created via chat is viewable/editable here. Dashboard is the source of truth; chat is a remote control.

---

## 4. Non-functional requirements

- **Privacy:** personal data (resume, contacts, history) never leaves local infra unless a cloud-fallback task is explicitly approved; even then, send the minimum needed (anonymize where feasible).
- **Cost:** $0 mandatory recurring cost in the core loop. Cloud fallback is pay-per-use and opt-in.
- **Latency:** intake + match < 30s on local model; research/VVP may run minutes async with progress updates.
- **Resilience:** agent failures degrade gracefully (partial brief > no brief); every agent run is logged & retryable.
- **Portability:** Docker-composed; runs on a laptop or a single small VPS. Model backend swappable (Ollama ↔ cloud) via config, no code change.
- **Auditability:** every agent action stored as a task record (input, tools used, output, model used, cost).

---

## 5. Model routing policy

A single **Model Router** decides local vs cloud per task:

| Task | Default | Fallback trigger |
|---|---|---|
| Field extraction, classification, stage suggestions | Local (small, fast) | rarely |
| Resume tailoring, cover letters | Local (mid) | owner opt-in for quality |
| Company research synthesis (long context) | Local (mid/large) → **cloud if context too big** | auto, with notice |
| VVP generation (reasoning-heavy) | Local (large) | owner opt-in |

Router records which model ran each task so cost/quality is transparent.

---

## 6. Open questions for the build phase

1. Resume rendering: HTML→PDF (Playwright/WeasyPrint) vs. LaTeX vs. a templating lib? (affects design control)
2. VVP slide output: generate `.pptx` via a skill, or Markdown→reveal.js? 
3. How much of the dashboard does Lovable scaffold vs. Claude Code hand-builds against the API contract?
4. Local model picks depend on the owner's final hardware (TBD) — see `03-RESOURCES.md` tiering.
