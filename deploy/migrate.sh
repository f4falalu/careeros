#!/usr/bin/env bash
# Run Drizzle migrations against the production Fly.io Postgres
# Usage: ./deploy/migrate.sh
# Requires: flyctl authenticated, careeros-db deployed and running
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Read the production password from Fly secrets
echo "==> Fetching DB credentials..."
PG_PASSWORD=$(fly secrets list --app careeros-db 2>/dev/null | grep POSTGRES_PASSWORD | head -1 | awk '{print $1}' || echo "")
if [[ -z "$PG_PASSWORD" ]]; then
  echo "ERROR: Could not read POSTGRES_PASSWORD from careeros-db secrets."
  echo "Set it with: fly secrets set POSTGRES_PASSWORD=<password> --app careeros-db"
  exit 1
fi

LOCAL_PORT=15432

echo "==> Starting Fly proxy (careeros-db:5432 → localhost:$LOCAL_PORT)..."
fly proxy "$LOCAL_PORT:5432" --app careeros-db &
PROXY_PID=$!
sleep 3  # Give the tunnel time to establish

cleanup() {
  echo "  Stopping proxy..."
  kill "$PROXY_PID" 2>/dev/null || true
}
trap cleanup EXIT

echo "==> Running Drizzle migrations..."
cd "$REPO_ROOT/apps/api"
DATABASE_URL="postgresql://careeros:${PG_PASSWORD}@localhost:${LOCAL_PORT}/careeros" \
  npx drizzle-kit migrate

echo ""
echo "==> Enabling pgvector extension..."
DATABASE_URL="postgresql://careeros:${PG_PASSWORD}@localhost:${LOCAL_PORT}/careeros" \
  node -e "
    import('postgres').then(({ default: postgres }) => {
      const sql = postgres(process.env.DATABASE_URL, { max: 1 });
      sql\`CREATE EXTENSION IF NOT EXISTS vector\`.then(() => {
        console.log('pgvector extension enabled');
        return sql.end();
      });
    });
  " 2>/dev/null || \
  PGPASSWORD="$PG_PASSWORD" psql -h localhost -p "$LOCAL_PORT" -U careeros -d careeros \
    -c 'CREATE EXTENSION IF NOT EXISTS vector;'

echo ""
echo "✓ Migrations complete."
