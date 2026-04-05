#!/usr/bin/env bash
set -euo pipefail

# ─── OVNI AI Database Migration Script ───��─────────────────────
# Runs pending migrations against DATABASE_URL
# Usage: ./scripts/migrate.sh
# Called automatically by scripts/deploy.sh before app restart

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "=== OVNI AI Database Migration ==="
echo "Environment: ${NODE_ENV:-development}"
echo "Running pending migrations..."

# Check DATABASE_URL is set
if [ -z "${DATABASE_URL:-}" ]; then
  # Try loading from .env
  if [ -f .env ]; then
    export $(grep -v '^#' .env | grep DATABASE_URL | xargs)
  fi
  if [ -z "${DATABASE_URL:-}" ]; then
    echo "ERROR: DATABASE_URL is not set"
    exit 1
  fi
fi

# Run migrations
npx node-pg-migrate up --config migrate.json

echo "=== Migrations complete ==="
