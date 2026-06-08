# CareerOS — Concept Note

> An AI-native, multi-agent career operating system. Paste a job link into Telegram or
> WhatsApp and the agents research the company, tailor your resume, build a value-validation
> project, draft outreach, and track the application — end to end.

---

## 1. The problem

Job searching is fragmented across ~7 disconnected tools (resume in Word/Canva, research in
Google, tracking in spreadsheets, outreach in LinkedIn, prep in notes). Every application means
re-doing the same manual, context-switching work. The cost isn't any single task — it's the
*friction between* tasks.

## 2. The product thesis

Collapse the entire job-search lifecycle into **one workspace driven by specialized AI agents**,
reachable from where you already are: a chat app. Not "a better resume generator" — a system that
optimizes for **getting hired faster**, not just producing prettier documents.

The lifecycle CareerOS owns:

```
Discover → Understand → Build assets → Prove value → Apply → Outreach → Interview → Offer → Track
```

## 3. What makes it different

| Most AI job tools | CareerOS |
|---|---|
| Stop at resume tailoring | Generate a company-specific **Value Validation Project (VVP)** |
| Dashboard-only | **Chat-first** (Telegram/WhatsApp) — paste a link, agents work |
| Single model call | **Multi-agent** orchestration with memory + a career CRM |
| One-off documents | Persistent **career graph**: every company, contact, application linked |

The two genuine moats: **(a)** the VVP engine (a tangible "here's what I'd do for you" artifact),
and **(b)** the chat-first agent UX that removes the dashboard as a barrier to action.

## 4. Design constraint: local-first, open-source

Per project owner's directive, the system is built **open-source and local-first**:

- All inference defaults to **local models via Ollama** (Llama / Mistral / Qwen class).
- A **cloud fallback** (Claude / OpenAI / OpenRouter) is wired in but only triggers on
  explicit opt-in or when a task exceeds local-model capability (e.g. long-context research synthesis).
- Messaging uses **Telegram Bot API** (free, official) and **OpenWA** (self-hosted, open-source
  WhatsApp gateway) rather than paid Business APIs.
- No mandatory paid SaaS in the core loop (auth, DB, vector store, queue are all self-hostable).

This keeps personal-use cost near zero and data on the owner's own infrastructure. It also means
nothing blocks a later pivot to a hosted multi-user product — the cloud adapters already exist.

## 5. Scope for v1 (personal tool)

Single-user, self-hosted, runs on the owner's machine or a cheap VPS. Publishable later, but v1 is
explicitly **not** multi-tenant. This decision simplifies auth, billing, rate-limiting, and data
isolation out of the MVP entirely — see `04-ROADMAP.md`.

## 6. Reference inspirations

- **Workflow / UX**: Welcome to the Jungle app (pipeline + opportunity cards), Google Stitch.
- **Mental model**: "Cursor for careers + Linear for the pipeline + Perplexity for research."
- **Code to mine** (see `05-PRIOR-ART.md`): JustHireMe, JadeAI, career-ops, ai-job-search.

## 7. Success criteria for v1

A real applied measure, not vanity metrics:

1. Owner can go from **pasted job link → tailored resume + company brief + outreach draft in < 15 min**, mostly hands-off.
2. Every application the owner sends in a month is **captured in the CRM** without manual entry.
3. At least the resume, research, and tracker agents run **fully on local models** with acceptable quality.
