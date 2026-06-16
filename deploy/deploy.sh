#!/usr/bin/env bash
# CareerOS — Fly.io deployment script
# Run from the repo root: ./deploy/deploy.sh
# Requires: flyctl installed and authenticated (fly auth login)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# ── Load secrets from local .env ──────────────────────────────────────────────
if [[ ! -f "$REPO_ROOT/.env" ]]; then
  echo "ERROR: .env not found at $REPO_ROOT/.env"
  exit 1
fi

# Extract values we need (strip surrounding whitespace/quotes)
APP_SECRET=$(grep '^APP_SECRET=' "$REPO_ROOT/.env" | cut -d= -f2- | tr -d '"' | tr -d "'")
GROQ_API_KEY=$(grep '^GROQ_API_KEY=' "$REPO_ROOT/.env" | cut -d= -f2- | tr -d '"' | tr -d "'")
TELEGRAM_BOT_TOKEN=$(grep '^TELEGRAM_BOT_TOKEN=' "$REPO_ROOT/.env" | cut -d= -f2- | tr -d '"' | tr -d "'")

if [[ -z "$APP_SECRET" ]]; then
  echo "ERROR: APP_SECRET is not set in .env"
  exit 1
fi

echo "==> Deploying CareerOS to Fly.io"
echo ""

# ── Step 1: Postgres (careeros-db) ────────────────────────────────────────────
echo "── [1/5] Postgres (careeros-db) ──────────────────────────────────────────"
if ! fly apps list | grep -q careeros-db; then
  echo "  Creating Fly app careeros-db..."
  fly launch --no-deploy --copy-config --app careeros-db \
    --config "$REPO_ROOT/deploy/postgres/fly.toml" 2>/dev/null || true
  fly volumes create careeros_db_data --region iad --size 5 --app careeros-db
  PG_PASSWORD=$(openssl rand -hex 20)
  fly secrets set POSTGRES_PASSWORD="$PG_PASSWORD" --app careeros-db
  echo ""
  echo "  !! SAVE THIS POSTGRES PASSWORD: $PG_PASSWORD"
  echo "     DATABASE_URL will be: postgresql://careeros:${PG_PASSWORD}@careeros-db.internal:5432/careeros"
  echo ""
  DATABASE_URL="postgresql://careeros:${PG_PASSWORD}@careeros-db.internal:5432/careeros"
else
  echo "  careeros-db already exists — skipping creation."
  echo "  Make sure DATABASE_URL is set as a secret on careeros-api."
  DATABASE_URL=""
fi

cd "$REPO_ROOT/deploy/postgres" && fly deploy --app careeros-db
cd "$REPO_ROOT"

# ── Step 2: Redis (careeros-redis via Upstash) ────────────────────────────────
echo ""
echo "── [2/5] Redis ───────────────────────────────────────────────────────────"
if ! fly redis list 2>/dev/null | grep -q careeros-redis; then
  echo "  Creating Upstash Redis..."
  REDIS_URL=$(fly redis create careeros-redis --region iad --no-replicas 2>&1 | grep 'redis://' | tr -d ' ')
  echo "  Redis URL: $REDIS_URL"
else
  echo "  careeros-redis already exists."
  REDIS_URL=$(fly redis status careeros-redis 2>/dev/null | grep 'Private URL' | awk '{print $3}' || echo "")
fi

# ── Step 3: SearXNG ───────────────────────────────────────────────────────────
echo ""
echo "── [3/5] SearXNG (careeros-searxng) ──────────────────────────────────────"
if ! fly apps list | grep -q careeros-searxng; then
  fly apps create careeros-searxng
fi
cd "$REPO_ROOT/deploy/searxng" && fly deploy --app careeros-searxng
cd "$REPO_ROOT"

# ── Step 4: API (careeros-api) ────────────────────────────────────────────────
echo ""
echo "── [4/5] API (careeros-api-f4) ────────────────────────────────────────────"
if ! fly apps list | grep -q careeros-api-f4; then
  fly apps create careeros-api-f4
  fly volumes create careeros_api_data --region iad --size 1 --app careeros-api-f4
fi

# Set API secrets
fly secrets set \
  APP_SECRET="$APP_SECRET" \
  CORS_ORIGINS="https://careeros-web-f4.fly.dev" \
  GROQ_API_KEY="$GROQ_API_KEY" \
  --app careeros-api-f4

if [[ -n "$DATABASE_URL" ]]; then
  fly secrets set DATABASE_URL="$DATABASE_URL" --app careeros-api-f4
fi
if [[ -n "$REDIS_URL" ]]; then
  fly secrets set REDIS_URL="$REDIS_URL" --app careeros-api-f4
fi
if [[ -n "$TELEGRAM_BOT_TOKEN" ]]; then
  fly secrets set TELEGRAM_BOT_TOKEN="$TELEGRAM_BOT_TOKEN" --app careeros-api-f4
fi

# Run DB migrations before deploying the API
echo "  Running Drizzle migrations..."
fly ssh console --app careeros-db --command \
  "psql -U careeros -c 'CREATE EXTENSION IF NOT EXISTS vector;'" 2>/dev/null || true

cd "$REPO_ROOT/apps/api" && fly deploy --app careeros-api-f4
cd "$REPO_ROOT"

# ── Step 5: Web (careeros-web-f4) ─────────────────────────────────────────────
echo ""
echo "── [5/5] Web (careeros-web-f4) ────────────────────────────────────────────"
if ! fly apps list | grep -q careeros-web-f4; then
  fly apps create careeros-web-f4
fi

cd "$REPO_ROOT/apps/web" && fly deploy --app careeros-web-f4 \
  --build-arg NEXT_PUBLIC_API_URL="https://careeros-api-f4.fly.dev" \
  --build-arg NEXT_PUBLIC_WS_URL="wss://careeros-api-f4.fly.dev" \
  --build-arg NEXT_PUBLIC_APP_SECRET="$APP_SECRET"
cd "$REPO_ROOT"

echo ""
echo "✓ Deployment complete!"
echo "  Web:  https://careeros-web-f4.fly.dev"
echo "  API:  https://careeros-api-f4.fly.dev"
echo "  Health: https://careeros-api-f4.fly.dev/health"
