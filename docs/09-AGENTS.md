# CareerOS — Agent Specifications (`AGENTS.md`)

The build contract for every agent. Each spec gives: **trigger · model class · tools · output schema
(Pydantic) · guardrails · the AgentTask it writes**. Output schemas mirror `07-SCHEMA.sql` and
`08-OPENAPI.yaml` — keep them in sync; the API serializes these shapes.

> **Cross-cutting rules (apply to every agent):**
> 1. No agent calls a model directly — always through the **Model Router** (§13).
> 2. Every run opens an `AgentTask` (status `running`), and on completion writes `output`,
>    `tools_used`, `model_kind`, `model_name`, `cost_usd`, `status`. Failures write `error` + `failed`.
> 3. Agents return **typed Pydantic objects**, never free text the caller has to parse.
> 4. Anything that would send externally stops at `needs_approval` — it never sends itself (v1).
> 5. Research-style claims must carry **sources**; agents do not assert facts from model memory.

---

## 0. Shared types

```python
from pydantic import BaseModel, Field
from typing import Literal, Optional
from uuid import UUID
from datetime import datetime

class Source(BaseModel):
    title: str
    url: str
    fetched_at: datetime

class AgentResult(BaseModel):
    """Wrapper every agent returns; the orchestrator persists it to agent_tasks."""
    ok: bool
    summary: str                      # one-line, human-facing (used in chat replies)
    data: BaseModel | None = None     # the agent-specific payload below
    needs_approval: bool = False
    error: Optional[str] = None
```

---

## 1. Orchestrator (not an LLM agent — control plane)

**Job:** receive a normalized event (chat message / API call), detect intent, dispatch to the right
agent(s), hold session memory, stream progress to chat + `/ws`, and **enforce the approval gate**.

- **Intent detection:** cheap local classification — is this a *new job* (URL/JD/screenshot), a
  *menu action reply* ("1,3"), a *question* (route to Strategist), or *profile edit*?
- **Fan-out:** on intake, runs Intake → (Research ∥ Match) concurrently, then composes the chat menu.
- **Does NOT contain business logic** — it routes and composes. Each agent owns its own work.
- Writes a parent `AgentTask` per user action; child agent tasks reference it via `related_id`.

```python
class ChatMenu(BaseModel):
    opportunity_id: UUID
    headline: str                     # "Acme · PM · match 82%"
    missing_skills: list[str]
    actions: list[Literal["tailor_resume","build_vvp","draft_outreach","cover_letter","mark_applied"]]
```

---

## 2. Intake Agent

| | |
|---|---|
| **Trigger** | `/intake`, or a URL/text/PDF/image arriving via chat |
| **Model** | local small/mid (fast extraction); vision model if input is an image |
| **Tools** | `web_fetch(url)`, `pdf_extract(path)`, `ocr(path)` (or vision model), `upsert_company`, `create_opportunity` |
| **Writes** | `opportunities` row (+ `companies` upsert) |

**System prompt skeleton:**
```
You extract structured job data from a posting. You NEVER invent fields. If a field is absent,
return null — do not guess salary, visa, or seniority. Output ONLY the JobExtraction schema.
Normalize skills to short canonical tokens (e.g. "PostgreSQL" not "experience with Postgres DBs").
```

**Output schema:**
```python
class JobExtraction(BaseModel):
    company_name: str
    company_domain: Optional[str] = None
    role_title: str
    seniority: Optional[str] = None
    location: Optional[str] = None
    work_model: Literal["remote","hybrid","onsite","unknown"] = "unknown"
    salary_text: Optional[str] = None
    visa_signal: Optional[str] = None
    required_skills: list[str] = []
    nice_to_haves: list[str] = []
    description: str                       # cleaned JD text
    apply_url: Optional[str] = None
    confidence: float = Field(ge=0, le=1)  # extraction confidence
```

**Guardrails:** null over guess; if `confidence < 0.5`, return `ok=True` but flag in `summary` so the
orchestrator asks the user to confirm. Strip tracking params from URLs before storing.

---

## 3. Research Agent (Company Intelligence)

| | |
|---|---|
| **Trigger** | new company on intake, or `/companies/{id}/brief` |
| **Model** | local mid → **cloud fallback if context too large** (long multi-source synthesis) |
| **Tools** | `search(query)` (SearXNG/Tavily), `web_fetch(url)`, `save_brief` |
| **Writes** | `company_briefs` row (with `sources[]`) |

**System prompt skeleton:**
```
You research a company for a job seeker. Use the search tool — do NOT state facts from memory.
Every claim about funding, leadership, products, or news MUST trace to a fetched source in `sources`.
If you cannot verify a section, return it empty rather than fabricating. Be concise and current;
prefer sources dated within 12 months. Output ONLY the CompanyBrief schema.
```

**Output schema:**
```python
class CompanyBrief(BaseModel):
    business_model: Optional[str] = None
    products: list[str] = []
    funding: Optional[str] = None          # stage / amount, with source
    competitors: list[str] = []
    leadership: list[str] = []
    recent_news: list[str] = []
    culture_signals: list[str] = []
    hiring_signals: list[str] = []
    sources: list[Source]                   # REQUIRED, non-empty if any claim is made
```

**Guardrails:** non-empty `sources` whenever factual sections are populated; a post-step rejects the
result if any populated section has zero supporting sources. Cache by company+domain; mark `is_stale`
after 30 days (handled in SQL).

---

## 4. Match Agent

| | |
|---|---|
| **Trigger** | after intake, or `/opportunities/{id}/match` |
| **Model** | local small + pgvector similarity (not purely an LLM task) |
| **Tools** | `embed(text)`, `vector_search(achievements, skills)`, `score` |
| **Writes** | `match_scores` row |

**Logic:** embed the JD's required skills + responsibilities, compare against the profile's
`achievements` and `skills` embeddings, combine semantic similarity with explicit skill overlap into a
0–100 score; list skills present in the JD but absent from the profile.

**Output schema:**
```python
class MatchScore(BaseModel):
    score: float = Field(ge=0, le=100)
    matched_skills: list[str]
    missing_skills: list[str]
    rationale: str                          # 1-2 sentences, plain
```
**Guardrails:** deterministic-ish — the LLM only writes `rationale`; the number comes from the
scoring function so it's reproducible and explainable.

---

## 5. Resume Agent  ⚠️ highest-trust agent

| | |
|---|---|
| **Trigger** | `tailor_resume` action / `/opportunities/{id}/resume` |
| **Model** | local mid (opt-in cloud for quality) |
| **Tools** | `get_profile`, `get_opportunity`, `get_brief`, `vector_search(achievements)`, `render_pdf` |
| **Writes** | `resume_versions` row + PDF to object store |

**System prompt skeleton:**
```
You tailor an existing resume to a job. You may REFRAME, REORDER, and EMPHASIZE the candidate's real
experience — you may NOT invent employers, titles, dates, degrees, metrics, or skills. Every line in
your output must be supported by a fact present in the master profile provided. Optimize for ATS:
mirror the JD's exact skill keywords WHERE the candidate genuinely has them. Quantify using only
metrics already in the profile. Output ONLY the TailoredResume schema.
```

**Output schema:**
```python
class ResumeBullet(BaseModel):
    text: str
    source_achievement_id: Optional[UUID] = None   # traceability (null only for summary/header lines)

class TailoredResume(BaseModel):
    label: str                               # resume_v{n}_{company}_{role}
    summary: str
    sections: dict[str, list[ResumeBullet]]  # e.g. {"Experience":[...], "Skills":[...]}
    keywords_targeted: list[str]
    ats_score: float = Field(ge=0, le=100)
```

**Guardrails — the no-fabrication validator (build in Phase 1, blocking):**
1. After generation, run a **validator pass** (separate router call, local): for each bullet, confirm
   it is entailed by the master profile. Any bullet not traceable → reject or strip.
2. Skill keywords in output must intersect the profile's skills; flag any that don't.
3. Set `resume_versions.validated = true` only if the validator passes. The API never returns a PDF
   for an unvalidated resume without an explicit override flag.

---

## 6. Cover/Assets Agent

| | |
|---|---|
| **Trigger** | `cover_letter` action / `/opportunities/{id}/cover-letter` |
| **Model** | local mid |
| **Tools** | `get_profile`, `get_opportunity`, `get_brief` |
| **Writes** | `cover_letters` row |

**System prompt skeleton:**
```
Write a cover letter / application email in the requested tone ({formal|warm|direct}, default from
profile tone_prefs). Ground specifics in the company brief and the candidate's real experience.
No fabricated achievements. Keep it under ~250 words. Output ONLY the CoverLetter schema.
```
```python
class CoverLetter(BaseModel):
    tone: Literal["formal","warm","direct"]
    subject: Optional[str] = None
    body: str
```
**Guardrails:** same no-fabrication rule as Resume (lighter validator — spot-check claims against profile).

---

## 7. VVP Agent (Value Validation Project — the differentiator)

| | |
|---|---|
| **Trigger** | `build_vvp` action / `/opportunities/{id}/vvp` |
| **Model** | local large → **cloud opt-in** (reasoning-heavy) |
| **Tools** | `search`, `web_fetch`, `get_brief`, `get_opportunity`, `render_report`, `render_slides` (pptx skill), `prototype_spec` |
| **Writes** | `vvps` row + artifact (pdf/pptx) |

**Two-step:** (a) **propose** 2–3 angles fit to the role; (b) on selection, **generate** the artifact.

**System prompt skeleton (propose):**
```
Given a company brief and a role, propose 2-3 Value Validation Project angles that demonstrate the
candidate could do THIS job at THIS company. Angle must map to the role's real responsibilities.
Ground every premise in a sourced company fact. Output ONLY VvpProposal.
```

**Output schemas:**
```python
class VvpAngle(BaseModel):
    kind: Literal["audit","growth_strategy","automation","market_analysis",
                  "product_improvement","analytics_dashboard","other"]
    title: str
    premise: str
    why_it_lands: str
    sources: list[Source]

class VvpProposal(BaseModel):
    angles: list[VvpAngle]                   # 2-3

class VvpArtifact(BaseModel):
    kind: str
    format: Literal["report","slides","prototype_spec"]
    title: str
    content: dict                            # structured body (sections / slides / spec)
    sources: list[Source]
```
**Guardrails:** premises must cite real company facts (reuse Research's sources discipline); role-aware
templates (PM→feature opportunity analysis, Eng→architecture proposal, Data→dashboard spec). Never
present speculation as fact about the company's internals.

---

## 8. Tracker Agent

| | |
|---|---|
| **Trigger** | `mark_applied` action, stage change, or an inbox event suggesting movement |
| **Model** | local small (classification only) |
| **Tools** | `get_application`, `set_stage` (writes `stage_events`) |
| **Writes** | `applications.stage` + `stage_events` row |

**Logic:** mostly deterministic. When acting on an inbox signal (e.g. "we'd like to schedule a call"),
it **suggests** a stage move with `actor='agent:tracker'`; the user confirms unless it's an explicit
`mark_applied`. Output: the updated `Application` shape from the OpenAPI.

**Guardrails:** agent-initiated stage changes are suggestions surfaced in the task feed, not silent writes (except explicit user actions).

---

## 9. Outreach Agent

| | |
|---|---|
| **Trigger** | `draft_outreach` action / `/outreach` |
| **Model** | local mid |
| **Tools** | `get_brief`, `get_contact`, `get_profile` (tone) |
| **Writes** | `outreach_messages` row, **state = `draft`** |

**System prompt skeleton:**
```
Draft a {recruiter|hiring_manager|founder|referral} message for the given channel. Use the candidate's
tone prefs and ground hooks in real company facts. Be specific, brief, non-generic. Output ONLY
OutreachDraft. You are drafting only — this will NOT be sent without explicit human approval.
```
```python
class OutreachDraft(BaseModel):
    channel: Literal["email","linkedin","telegram","whatsapp","other"]
    subject: Optional[str] = None
    body: str
    contact_role: Literal["recruiter","hiring_manager","founder","referral","other"]
```
**Guardrails:** always persists as `draft`; `needs_approval=True`. No send capability exists in the
agent's toolset in v1 — sending is a separate, explicit, user-triggered step.

---

## 10. Follow-up Agent

| | |
|---|---|
| **Trigger** | scheduler (3/7/14 days after an outreach with no reply) |
| **Model** | local mid |
| **Tools** | `get_outreach_thread`, `schedule` |
| **Writes** | `follow_ups` row, drafted body, state `draft` |

Output: `OutreachDraft` shape (reused). **Guardrails:** draft-only, approval-gated; skips if a reply
was logged on the thread.

---

## 11. Interview Agent

| | |
|---|---|
| **Trigger** | application reaches `interview` / `/applications/{id}/interview-brief` |
| **Model** | local mid (brief); mock loop is conversational |
| **Tools** | `get_brief`, `get_opportunity`, `vector_search(achievements)` (for STAR answers) |
| **Writes** | `interviews.brief`, `mock_sessions` |

```python
class InterviewBrief(BaseModel):
    company_recap: str
    role_focus: str
    likely_questions: list[str]
    star_answers: list[dict]        # {question, situation, task, action, result} — drawn from real achievements
    technical_topics: list[str]
    sources: list[Source]
```
**Guardrails:** STAR answers built only from real achievements (traceability like Resume). Mock-session
feedback is supportive and concrete, never harsh.

---

## 12. Strategist Agent

| | |
|---|---|
| **Trigger** | user asks ("am I competitive?"), or weekly digest |
| **Model** | local large → cloud opt-in (operates over the whole graph) |
| **Tools** | `query_graph` (applications, match scores, outcomes), `search` (market data) |
| **Writes** | advisory `AgentTask` output (no destructive writes) |

```python
class StrategyAdvice(BaseModel):
    target_roles: list[str]
    competitiveness: str            # honest, evidence-based read
    skill_gaps: list[str]
    next_actions: list[str]
    sources: list[Source] = []      # for any market claims
```
**Guardrails:** honest over flattering — surfaces real gaps; does not inflate competitiveness.
Career/market claims that are factual carry sources. This is advice, not autonomous action.

---

## 13. Model Router (shared infrastructure, not an agent)

Every agent calls `router.complete(task_type, messages, schema=...)`. The router:
1. Picks **local vs cloud** per the policy in `01-PRD.md §5` and `MODEL_TIER`.
2. Auto-escalates to cloud **only** when (a) context exceeds the local model's window, or
   (b) the agent declared `allow_cloud=True` and the user opted in.
3. Records `model_kind`, `model_name`, `cost_usd` onto the calling agent's `AgentTask`.
4. Degrades gracefully: if cloud is disabled and context is too large, it chunks/summarizes locally
   rather than failing outright, and notes the degradation in `summary`.

```python
class RouteDecision(BaseModel):
    model_kind: Literal["local","cloud"]
    model_name: str
    reason: str
```

---

## 14. Build order for agents (maps to `04-ROADMAP.md`)
- **Phase 1:** Router → Intake → Research → Match → Resume (+validator) → Cover → Tracker.
- **Phase 2:** VVP → Outreach.
- **Phase 3:** Follow-up → Interview → Strategist.

Build the **Router and the Resume validator first within Phase 1** — everything else assumes both exist.

## 15. Testing each agent (minimum bar before "done")
- **Golden inputs:** a few real job posts saved as fixtures; assert schema validity + key fields.
- **Resume validator:** a red-team fixture where the JD tempts fabrication (asks for a skill the
  profile lacks) — assert the agent does NOT claim it.
- **Research:** assert every populated factual section has ≥1 source; assert no output when search returns nothing.
- **Outreach/Follow-up:** assert state is always `draft` and no send tool is reachable.
- **Router:** assert local-by-default, cloud only on opt-in/over-context, and that the decision is logged.
