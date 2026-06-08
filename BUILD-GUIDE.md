# CareerOS — Build Execution Guide (`BUILD-GUIDE.md`)

Step-by-step directions for starting and executing the CareerOS build in Claude Code. Written for the
actual current (2026) Claude Code workflow: Desktop App or CLI, Plan Mode, CLAUDE.md, /resume, /goal,
and per-phase execution. Follow in order — do not skip ahead.

---

## Part 1 — Install & configure Claude Code

### Step 1. Prerequisites
Before anything else, confirm you have:
- A **Claude Pro or Max subscription** (claude.ai — Claude Code requires Pro at minimum).
- **Node.js 18+** installed. Check: `node --version`.
- **Docker Desktop** installed and running. Check: `docker ps`.
- **Git** installed. Check: `git --version`.

### Step 2. Install Claude Code

**Option A — Desktop App (macOS or Windows, recommended)**
1. Go to `claude.ai/download` and download the desktop app.
2. Open it, sign in with your Claude account.
3. Click the **Code** tab. That's Claude Code — no terminal needed for basic use.
4. The sidebar shows active sessions; each session in a Git repo gets its own isolated worktree.

**Option B — CLI (all platforms including Linux)**
```bash
npm install -g @anthropic-ai/claude-code
claude login                  # opens browser sign-in — complete the OAuth flow
claude --version              # confirm it's working
```

> **Note:** as of mid-2026, the standard setup flow is OAuth browser sign-in, not pasting an API key.
> Some older guides show the API-key path — use the browser flow instead.

### Step 3. Configure safety settings
Before touching any code, lock down the agent's permissions.
Claude Code operates autonomously and has direct access to your filesystem.

**Create `.claude/settings.json` in the project root:**
```json
{
  "defaultMode": "plan",
  "permissions": {
    "allow": [
      "read:./careeros/**",
      "write:./careeros/**",
      "network:github.com",
      "network:registry.npmjs.org",
      "network:ollama:11434"
    ],
    "deny": [
      "read:~/.ssh",
      "read:~/.aws",
      "read:~/.config/1password",
      "write:/**"
    ]
  }
}
```

- `defaultMode: plan` starts every session in Plan Mode — the agent proposes, you approve, then it executes. For the first month, leave plan mode on while you learn how Claude Code thinks and what it tends to get wrong.
- The deny list blocks SSH keys, AWS credentials, and password managers per `SECURITY.md A2–A3`.
- Never use `--dangerously-skip-permissions` on this machine (`SECURITY.md A4`).

---

## Part 2 — Set up the repo

### Step 4. Create the repo and folder structure
```bash
mkdir careeros && cd careeros
git init
git checkout -b main

# Create the folder structure the docs reference
mkdir -p docs apps/api/src/router apps/web .claude/agents .claude/commands data

# .gitignore — keep secrets and build artifacts out
cat > .gitignore << 'EOF'
.env
data/
node_modules/
dist/
.DS_Store
*.pyc
__pycache__/
EOF
```

### Step 5. Drop in the planning docs
Copy every file from this planning package into place:
```
careeros/
├── CLAUDE.md                  ← root (Claude Code reads this automatically)
├── SECURITY.md
├── QUICKSTART.md
├── BUILD-GUIDE.md             ← this file
├── README.md
├── .env.example
├── docker-compose.yml
├── docs/
│   ├── 00-CONCEPT-NOTE.md
│   ├── 01-PRD.md
│   ├── 02-ARCHITECTURE.md
│   ├── 03-RESOURCES.md
│   ├── 04-ROADMAP.md
│   ├── 05-PRIOR-ART.md
│   ├── 06-DESIGN.md
│   ├── 07-SCHEMA.sql
│   ├── 08-OPENAPI.yaml
│   ├── 09-AGENTS.md
│   ├── 10-SETTINGS.md
│   ├── 11-JOB-BOARDS.md
│   └── 12-PRODUCTION-READINESS.md
└── apps/
    └── api/
        ├── Dockerfile
        ├── package.json
        ├── tsconfig.json
        └── src/
            ├── config.ts
            ├── main.ts
            └── router/
                └── modelRouter.ts
```

### Step 6. First commit (the planning baseline)
```bash
git add .
git commit -m "chore: planning docs + Phase 0 scaffold"
```

This is your checkpoint. Everything from here happens on feature branches.

---

## Part 3 — Configure Claude Code for this project

### Step 7. Set up custom agents and commands
These give Claude Code specialized sub-agents and slash commands specific to CareerOS.

**Security reviewer agent** (runs after every significant change):
```bash
mkdir -p .claude/agents
cat > .claude/agents/security-reviewer.md << 'EOF'
---
name: security-reviewer
description: Review code changes for security issues. Use proactively after any auth, secrets, input handling, or outbound fetch changes.
---
Review the diff for: hardcoded secrets, missing Zod validation, SSRF risks in URL fetches (must block private IPs), SQL injection (use parameterised queries only), auth bypasses, and anything that would send data externally without approval. Flag issues clearly. Reference SECURITY.md for project rules.
EOF
```

**Phase kickoff command** (use at the start of each phase):
```bash
mkdir -p .claude/commands
cat > .claude/commands/phase.md << 'EOF'
---
name: phase
description: Begin a new build phase
argument-hint: "[phase number]"
---
We are starting Phase $0 of the CareerOS build. Read CLAUDE.md, docs/04-ROADMAP.md Phase $0 section, and any docs referenced there. Enter plan mode. Propose what will be built this phase, the exact files to be created/modified in order, and what the done condition is. Do not write any code yet.
EOF
```

**Resume command** (use any time you return to a session):
```bash
cat > .claude/commands/resume.md << 'EOF'
---
name: careeros-resume
description: Resume the CareerOS build from where it left off
---
Read CLAUDE.md and the last git log message. Identify which phase we are in and what was completed last. Summarise the current state in 3 sentences, then ask what to tackle next.
EOF
```

### Step 8. Set up pre-commit secret scanning
```bash
# Install gitleaks (catches accidentally committed secrets before they reach git history)
# macOS:
brew install gitleaks
# Linux:
# Download from https://github.com/gitleaks/gitleaks/releases

cat > .gitleaks.toml << 'EOF'
title = "CareerOS secret scan"
[extend]
useDefault = true
[[rules]]
description = "Env file with secrets"
regex = '''(?i)(api_key|secret|password|token)\s*=\s*[''"][^''"]{8,}[''"]'''
path = '''\.env'''
EOF

# Add pre-commit hook
cat > .git/hooks/pre-commit << 'EOF'
#!/bin/bash
gitleaks protect --staged --config=.gitleaks.toml
if [ $? -ne 0 ]; then
  echo "🚨 Secret detected — commit blocked. Check the output above."
  exit 1
fi
EOF
chmod +x .git/hooks/pre-commit
```

---

## Part 4 — Phase 0: Prove the stack works

### Step 9. Open Claude Code and start Phase 0

**Desktop App:** open the Code tab, navigate to your `careeros/` folder, start a new session.
**CLI:** `cd careeros && claude`

**First prompt — read the docs and plan Phase 0:**
```
/phase 0
```

Claude Code will read `CLAUDE.md` + the roadmap and propose a plan. Read it. If it matches
`docs/04-ROADMAP.md Phase 0`, approve it. If it deviates, correct it before approving.

> **Plan Mode habit:** ask for specifics — "plan this change with the list of files to be edited, the specific functions to be modified in each, and the order of operations." Once you set the bar, the agent meets it.

### Step 10. Configure the environment
```bash
cp .env.example .env
# Edit .env — change APP_SECRET to a long random string:
# openssl rand -hex 32
# Set MODEL_TIER=B for now (change later when hardware is confirmed)
```

### Step 11. Build and start the stack
Tell Claude Code (or run yourself):
```bash
docker compose up -d --build
```

Watch the logs until postgres, redis, ollama, and api are all healthy:
```bash
docker compose logs -f api
```

### Step 12. Pull a local model
```bash
docker compose exec ollama ollama pull llama3.2:3b
```
This is free, private, ~2GB. Takes a few minutes on first pull.

### Step 13. Verify Phase 0 is complete
```bash
# Health check — all four services should show true
curl -s localhost:8000/health | python3 -m json.tool

# Local model round-trip through the Model Router
curl -s -X POST localhost:8000/dev/llm-roundtrip \
  -H 'content-type: application/json' \
  -d '{"prompt":"Reply with exactly: CareerOS is alive."}' \
  | python3 -m json.tool
```

**Expected response:**
```json
{
  "text": "CareerOS is alive.",
  "modelKind": "local",
  "modelName": "llama3.2:3b",
  "reason": "tier default (local)"
}
```

**Phase 0 done checkpoint:**
```bash
git checkout -b phase-0-complete
git add .
git commit -m "feat: Phase 0 complete — stack up, health check green, local model round-trip working"
git checkout main
git merge phase-0-complete
```

---

## Part 5 — Phase 1 and beyond: the build loop

Every phase follows the same rhythm. Do not skip steps.

### The session loop (repeat for every work session)

```
1. git checkout -b phase-N-<feature>   ← always a feature branch, never main
2. open Claude Code → /careeros-resume  ← orient Claude to current state
3. /phase N                             ← plan the phase (or next feature within it)
4. Review the plan — approve or correct before any code is written
5. Claude executes → you review diffs
6. Run tests / health checks
7. git add . && git commit -m "feat: ..."   ← checkpoint commits, not big-bang
8. When phase feature is done → PR → merge to main
```

### Step 14. Phase 1 kickoff prompt
When Phase 0 is fully committed on main, start Phase 1:
```
/phase 1
```

Phase 1 is the vertical slice: Telegram → Intake → Research → Resume (+validator) → Tracker → dashboard.
The plan Claude proposes should match `docs/04-ROADMAP.md` and build against `docs/08-OPENAPI.yaml`.

**Key prompts for Phase 1 tasks:**

Lock the API and data layer first (Claude Code should do this before agents):
```
Read docs/08-OPENAPI.yaml and docs/07-SCHEMA.sql. Set up Drizzle ORM with schema 
matching 07-SCHEMA.sql exactly. Write a migration and confirm it applies cleanly 
against the running Postgres container. Do not touch agent code yet.
```

Then the Telegram bot:
```
Implement the Telegram bot ingress using grammY. It must: lock to TELEGRAM_ALLOWED_USER_IDS 
from config, handle URL/text/PDF/image input, normalize to an Event and POST to the 
orchestrator, and reply with the ChatMenu schema from docs/09-AGENTS.md §1. 
Write a test that sends a mock message and asserts the correct reply shape.
```

Then agents one by one, in roadmap order (Intake → Research → Match → Resume → Cover → Tracker):
```
Implement the Intake Agent per docs/09-AGENTS.md §2. It must: use the Model Router 
(never call a model directly), write an AgentTask audit row on start and completion, 
return the JobExtraction Zod schema, and set confidence < 0.5 to flag for user 
confirmation rather than hard-fail. Show me the plan (files + functions) before 
writing any code.
```

The Resume Agent gets special treatment — always build the validator first:
```
Before the Resume Agent generates anything, implement the no-fabrication validator: 
a separate router pass that checks each bullet is entailed by the master profile. 
Any bullet not traceable gets stripped. resume_versions.validated is only set true 
on a clean pass. This is a hard guardrail from CLAUDE.md — implement it first, 
then the generation. Include a red-team test: a JD that tempts fabrication (asks 
for a skill the profile lacks) must produce a resume that does NOT claim that skill.
```

### Step 15. Using Plan Mode effectively

- **Shift+Tab** to cycle: normal → auto-accept → plan mode. Footer shows current mode.
- `/plan` for a one-off plan on the next prompt only (stays in current mode after).
- `/ultraplan` for complex multi-file architectural tasks — slower but more thorough.
- If execution diverges from the approved plan, stop the agent and re-plan. Add this to `CLAUDE.md` if it happens repeatedly.
- For long autonomous sessions: `/goal all tests pass and /health returns all true` — Claude keeps working toward the condition, checking after each turn.

### Step 16. Recovering from interruptions
```
/resume
```
`/resume` is the single most useful command. If your session crashes, context gets compacted, or you come back the next day — /resume picks up exactly where you left off.

If `/resume` alone isn't enough context (long gap between sessions):
```
/careeros-resume
```
This runs the custom command that re-orients Claude to the current phase and last commit.

### Step 17. Context hygiene
Long sessions degrade quality as the context window fills.
- `/compact` — compresses earlier context, keeps recent work clear.
- `/clear` — full reset; use between phases or when the agent is clearly confused.
- Start a new session between major phases (Phase 1 → 2). The docs + git history + CLAUDE.md are your persistent context, not the chat window.

---

## Part 6 — Phase-specific checklists

Use these as the "done" gate before committing and moving on.

### Phase 0 done ✓
- [ ] `docker compose up` — all services healthy
- [ ] `curl localhost:8000/health` — db/redis/ollama all `true`
- [ ] Round-trip returns `modelKind: "local"`
- [ ] Committed on main

### Phase 1 done ✓
- [ ] Drizzle schema matches `07-SCHEMA.sql` — migration applies clean
- [ ] Telegram bot ingress working — paste a job URL, get a ChatMenu reply
- [ ] Intake Agent: opportunity created with ≥ 8 fields populated in < 30s
- [ ] Research Agent: company brief with sourced claims (no unsourced facts)
- [ ] Match Agent: score + missing skills returned
- [ ] Resume Agent: tailored PDF generated, `validated = true`, red-team test passes
- [ ] Cover Agent: cover letter generated
- [ ] Tracker: pipeline stages working, stage events written
- [ ] Dashboard: Home + Opportunities + Resume Studio — shows everything chat created
- [ ] Every agent writes an `agent_tasks` audit row — check the DB
- [ ] No secrets in git (`gitleaks protect --staged` passes)
- [ ] Security reviewer agent run on auth/fetch code

### Phase 2 done ✓
- [ ] VVP Agent generates a sourced, role-appropriate artifact
- [ ] Outreach Agent: messages always in `draft` state — no send capability accessible
- [ ] WhatsApp (OpenWA) bot mirrors Telegram flow — secondary number used
- [ ] Cloud fallback wired — Groq key added in Settings UI, test passes, personal data still forced local

### Phase 2.5 done ✓
- [ ] Remotive + Remote OK + WeWorkRemotely adapters polling on schedule
- [ ] Deduplication working (same job doesn't appear twice)
- [ ] "Discovered" feed in dashboard shows scored matches
- [ ] Attribution shown for each board

### Phase 3 done ✓
- [ ] Interview Brief generated when application reaches `interview` stage
- [ ] Mock Q&A loop working
- [ ] Follow-up drafts created on schedule (3/7/14 days)
- [ ] Strategist Agent responds to "am I competitive?" with sourced advice

---

## Part 7 — Safety reminders (don't skip these)

These come from `SECURITY.md` and apply throughout the build:

- **Feature branches always.** Never let Claude Code push to `main` directly.
- **Review every diff before merging.** Review AI-generated code as if it came from an unknown contractor — focus on auth, input validation, injection, SSRF, secrets handling.
- **SSRF guard on every outbound fetch** (intake URL fetcher, research fetcher, job-board poller). Ask Claude Code to add this explicitly — it's easy to miss.
- **Checkpoint commits often.** Small, reviewable commits beat big-bang diffs. Commit before every agent addition.
- **Run the security reviewer agent** after any change to: auth, input handling, URL fetching, outreach sending, or credentials. Just prompt: `run security-reviewer on the current diff`.
- **Never paste API keys into the Claude Code chat.** Keys go in `.env` (local) or via the Settings UI (runtime).
- **If the agent proposes anything involving main/production/credentials/migrations:** stop, read it carefully, then approve explicitly — don't rubber-stamp.

---

## Quick reference

| Command | What it does |
|---|---|
| `/phase N` | Start a phase — reads docs, plans, waits for approval |
| `/careeros-resume` | Re-orient after a gap — current phase, last commit, what's next |
| `/resume` | Resume a crashed or interrupted session |
| `/plan` | One-off plan for the next prompt only |
| `/ultraplan` | Deep plan for complex multi-file tasks |
| `/goal <condition>` | Run autonomously until a condition is met |
| `/compact` | Compress earlier context (use mid-session) |
| `/clear` | Full context reset (use between phases) |
| `Shift+Tab` | Cycle: normal → auto-accept → plan mode |
| `/model` | Switch between Opus (planning) and Sonnet (execution) |
