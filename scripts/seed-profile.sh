#!/usr/bin/env bash
# CareerOS — Profile seed script
# Edit the JSON payloads below to match your real experience, then run:
#   bash scripts/seed-profile.sh
#
# Prerequisites: API running on localhost:8000, APP_SECRET in .env

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC2046
  export $(grep -v '^#' "$ENV_FILE" | xargs)
fi

API_URL="${API_URL:-http://localhost:8000}"
TOKEN="${APP_SECRET:?APP_SECRET must be set in .env or environment}"

call() {
  local method="$1" path="$2" body="${3:-}"
  if [[ -n "$body" ]]; then
    curl -s -X "$method" "$API_URL$path" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d "$body"
  else
    curl -s -X "$method" "$API_URL$path" \
      -H "Authorization: Bearer $TOKEN"
  fi
}

echo "=== CareerOS profile seed ==="
echo "API: $API_URL"
echo ""

# ─────────────────────────────────────────────────────────────
# 1. Master resume / bio
# ─────────────────────────────────────────────────────────────
echo "→ Seeding profile / master resume..."
call PUT /profile '{
  "master_resume": {
    "name": "Your Name",
    "email": "you@example.com",
    "location": "Paris, France",
    "headline": "Senior Software Engineer · 8 years · TypeScript / Node.js / Python",
    "summary": "Full-stack engineer with 8 years building scalable products at Series A–C startups and scale-ups. Led teams of 3–6 engineers. Shipped 0→1 SaaS products and scaled them to 100k users. Strong opinions on developer experience, observability, and keeping infra simple.",
    "experience": [
      {
        "company": "Acme Corp",
        "title": "Senior Software Engineer",
        "start": "2022-01",
        "end": null,
        "bullets": [
          "Rebuilt the core data pipeline in TypeScript (Node.js) reducing P95 latency from 4s to 320ms",
          "Led migration from REST to GraphQL; reduced client-side over-fetching by 60%",
          "Mentored 3 junior engineers; introduced weekly technical reviews"
        ]
      },
      {
        "company": "Beta Labs",
        "title": "Software Engineer",
        "start": "2019-03",
        "end": "2022-01",
        "bullets": [
          "Built multi-tenant SaaS billing system handling €2M/month",
          "Introduced BullMQ-based background job queue; reduced webhook failure rate from 12% to 0.3%",
          "Designed and shipped mobile onboarding flow (React Native) that improved D7 retention by 18%"
        ]
      },
      {
        "company": "Gamma Startup",
        "title": "Junior Engineer",
        "start": "2017-06",
        "end": "2019-03",
        "bullets": [
          "Built internal admin dashboard (React + Django REST) used daily by 30 ops agents",
          "Automated manual CSV reporting pipeline saving 8h/week"
        ]
      }
    ],
    "education": [
      {
        "institution": "École Centrale Paris",
        "degree": "M.Eng. Computer Science",
        "year": 2017
      }
    ],
    "languages": ["French (native)", "English (fluent)"]
  },
  "tone_prefs": {
    "style": "direct",
    "avoid": ["buzzwords", "passive voice"],
    "prefer": ["concrete metrics", "active verbs"]
  }
}' | python3 -m json.tool 2>/dev/null || echo "(raw response above)"

echo ""

# ─────────────────────────────────────────────────────────────
# 2. Skills
# ─────────────────────────────────────────────────────────────
echo "→ Seeding skills..."
call POST /profile/skills '[
  {"name": "TypeScript",        "proficiency": 5, "years": 6},
  {"name": "Node.js",           "proficiency": 5, "years": 7},
  {"name": "React",             "proficiency": 4, "years": 6},
  {"name": "Python",            "proficiency": 4, "years": 5},
  {"name": "PostgreSQL",        "proficiency": 4, "years": 6},
  {"name": "Redis",             "proficiency": 3, "years": 3},
  {"name": "Docker",            "proficiency": 4, "years": 5},
  {"name": "Kubernetes",        "proficiency": 3, "years": 2},
  {"name": "GraphQL",           "proficiency": 4, "years": 4},
  {"name": "REST APIs",         "proficiency": 5, "years": 8},
  {"name": "BullMQ",            "proficiency": 4, "years": 3},
  {"name": "React Native",      "proficiency": 3, "years": 3},
  {"name": "Next.js",           "proficiency": 4, "years": 3},
  {"name": "Tailwind CSS",      "proficiency": 4, "years": 3},
  {"name": "AWS",               "proficiency": 3, "years": 4},
  {"name": "CI/CD",             "proficiency": 4, "years": 5},
  {"name": "System Design",     "proficiency": 4, "years": 5},
  {"name": "Team Leadership",   "proficiency": 4, "years": 4},
  {"name": "Agile / Scrum",     "proficiency": 4, "years": 6},
  {"name": "Technical Writing", "proficiency": 3, "years": 4}
]' | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'  Inserted {len(d)} skills')" 2>/dev/null || echo "  (check above output)"

echo ""

# ─────────────────────────────────────────────────────────────
# 3. Achievements (STAR-format bullets the resume agent can use)
# ─────────────────────────────────────────────────────────────
echo "→ Seeding achievements..."

seed_achievement() {
  call POST /achievements "$1" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'  ✓ {d[\"summary\"][:70]}')" 2>/dev/null || echo "  (error — check above)"
}

seed_achievement '{
  "summary": "Rebuilt core data pipeline in TypeScript (Node.js), reducing P95 latency from 4s to 320ms",
  "detail": "Rewrote a legacy Python pipeline using streaming transforms in Node.js. Introduced per-stage instrumentation. Cut tail latency 12×. No downtime migration using dual-write pattern.",
  "skills": ["TypeScript", "Node.js", "PostgreSQL", "System Design"],
  "metrics": {"latency_p95_before_ms": 4000, "latency_p95_after_ms": 320, "improvement_factor": 12}
}'

seed_achievement '{
  "summary": "Led REST→GraphQL migration; reduced client-side over-fetching by 60%",
  "detail": "Designed federated GraphQL schema, migrated 14 REST endpoints over 3 sprints, maintained backward compatibility via versioned REST gateway during transition.",
  "skills": ["GraphQL", "TypeScript", "Node.js", "REST APIs", "Team Leadership"],
  "metrics": {"over_fetch_reduction_pct": 60, "endpoints_migrated": 14, "sprints": 3}
}'

seed_achievement '{
  "summary": "Built multi-tenant SaaS billing system handling €2M/month in payment volume",
  "detail": "Designed idempotent Stripe webhook processor with BullMQ retries. Achieved 99.97% delivery rate. Modeled metered billing for 4 plan tiers. Passed SOC 2 audit.",
  "skills": ["Node.js", "TypeScript", "PostgreSQL", "BullMQ", "REST APIs"],
  "metrics": {"monthly_volume_eur": 2000000, "webhook_failure_rate_pct": 0.3, "plan_tiers": 4}
}'

seed_achievement '{
  "summary": "Reduced webhook failure rate from 12% to 0.3% by introducing BullMQ-based job queue",
  "detail": "Replaced fire-and-forget HTTP calls with durable BullMQ queue with exponential backoff (5 attempts). Added dead-letter queue and alerting. Eliminated customer complaints about missed events.",
  "skills": ["BullMQ", "Redis", "Node.js", "TypeScript"],
  "metrics": {"failure_rate_before_pct": 12, "failure_rate_after_pct": 0.3, "retry_attempts": 5}
}'

seed_achievement '{
  "summary": "Shipped React Native onboarding flow improving D7 retention by 18%",
  "detail": "Redesigned 7-step onboarding (value-first, lazy sign-up). A/B tested against old flow. Worked closely with designer. Shipped in 6 weeks.",
  "skills": ["React Native", "React", "TypeScript", "Agile / Scrum"],
  "metrics": {"d7_retention_improvement_pct": 18, "ab_test_duration_weeks": 3, "onboarding_steps": 7}
}'

seed_achievement '{
  "summary": "Mentored 3 junior engineers; introduced weekly technical reviews that halved PR review cycle time",
  "detail": "Set up structured 1:1 programme, pair programming sessions, and a weekly design-review ritual. PR cycle time dropped from 3.2 days to 1.6 days over 6 months.",
  "skills": ["Team Leadership", "Technical Writing", "Agile / Scrum"],
  "metrics": {"pr_cycle_before_days": 3.2, "pr_cycle_after_days": 1.6, "engineers_mentored": 3}
}'

seed_achievement '{
  "summary": "Automated manual CSV reporting pipeline saving 8 hours per week for ops team",
  "detail": "Built Python ETL scripts to pull data from 3 internal APIs, transform and aggregate, then push to Google Sheets via API. Deployed on a cron in AWS Lambda.",
  "skills": ["Python", "AWS", "REST APIs", "CI/CD"],
  "metrics": {"hours_saved_per_week": 8, "data_sources": 3}
}'

echo ""
echo "=== Seed complete ==="
echo ""
echo "Verify with:"
echo "  curl -s -H \"Authorization: Bearer \$APP_SECRET\" http://localhost:8000/profile | python3 -m json.tool"
echo "  curl -s -H \"Authorization: Bearer \$APP_SECRET\" http://localhost:8000/profile/skills | python3 -m json.tool"
echo "  curl -s -H \"Authorization: Bearer \$APP_SECRET\" http://localhost:8000/achievements | python3 -m json.tool"
