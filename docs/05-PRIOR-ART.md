# CareerOS — Prior Art: What to Borrow

Four reference repos were provided plus the AIHawk family that dominates this space. Verify each
at build time (stars/activity/license shift), but here's the honest read on what's worth mining.

## JadeAI — `LingyiChen-AI/JadeAI` ✅ closest match, mine heavily
Open-source AI resume builder, one-click Docker. Confirmed features directly relevant to us:
- 50+ resume templates; PDF/image **resume parsing** (extract content from an uploaded CV).
- **JD match analysis**: keyword matching + ATS score + improvement suggestions.
- **Cover letter generation** with tone selection (formal/friendly/confident).
- Grammar/weak-verb checking with a quality score; 10-language translation.
- **Bring-your-own-key**: OpenAI / Anthropic / custom endpoint, keys in browser local storage — never server-stored.
- DB swappable SQLite ↔ PostgreSQL; optional auth (fingerprint-based when off).

**Borrow:** the resume template system, the JD-match/ATS scoring approach, the tone-selectable cover
letter prompts, and the BYO-key pattern (maps neatly onto our local/cloud router). The custom-endpoint
support means it likely already talks to Ollama-style endpoints.

## AIHawk family — `feder-cr/Jobs_Applier_AI_Agent_AIHawk` (and forks)
The most-starred auto-apply project. Automates tailored applications; LangChain RAG over resume PDFs
for form answers; LinkedIn Easy-Apply automation.
**Borrow:** the RAG-over-resume idea for answering application questions (Phase 4). **Avoid:** its
LinkedIn browser-automation core — that's the ToS/ban risk we deliberately defer. Useful as a
reference for *how* auto-apply works if/when we gate it in.

## Other automation references — `imon333/Job-apply-AI-agent`, etc.
Python + n8n + Selenium + OpenAI: scrapes LinkedIn/Indeed/StepStone, generates CV + cover letter,
auto-applies, logs to Google Sheets/Airtable, email alerts.
**Borrow:** the **n8n orchestration pattern** (you already use n8n) and the Sheets/Airtable logging
idea as a lightweight CRM precedent. **Avoid:** the scraping core, same reason as above.

## The three repos with thin public signal
`vasu-devs/justhireme`, `santifer/career-ops`, and `MadsLorentzen/ai-job-search` didn't surface
clear, current details in search. **Action for Claude Code:** before borrowing, clone each, check the
README, license, and last-commit date, and report back what's actually reusable rather than assuming.

---

## Net recommendation
- **Fork JadeAI's resume + JD-match + cover-letter layer** as the starting point for our Resume Studio
  and Cover agent — it's the most aligned, is Dockerized, and already supports custom/local endpoints.
- **Build the orchestration, agents, CRM, VVP, and chat interface fresh** on Agno — no existing repo
  combines chat-first multi-agent + VVP + career CRM the way we want.
- **Reference, don't adopt,** the auto-apply/scraping projects; their risky core is exactly what we
  defer to a gated Phase 4.
- **Check licenses** before lifting code — confirm each is permissive (MIT/Apache) for your intended
  (eventually public) use.
