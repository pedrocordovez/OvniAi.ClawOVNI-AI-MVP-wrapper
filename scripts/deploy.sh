#!/usr/bin/env bash
set -euo pipefail

# ─── OVNI AI Deploy Script ─────────────────────────────────────
# Manual deploy: ssh into EC2 and run this script
# Usage: ./scripts/deploy.sh
#
# What it does:
# 1. Pull latest code from git
# 2. Install dependencies
# 3. Build TypeScript
# 4. Run database migrations
# 5. Restart app via PM2
# 6. Verify health check

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " OVNI AI — Deploy"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Load environment
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

# 1. Pull latest
echo "[1/6] Pulling latest code..."
git pull origin main

# 2. Install dependencies
echo "[2/6] Installing dependencies..."
npm ci --production=false

# 3. Build
echo "[3/6] Building TypeScript..."
npm run build

# 4. Run migrations
echo "[4/6] Running database migrations..."
./scripts/migrate.sh

# 5. Restart app
echo "[5/6] Restarting app via PM2..."
if pm2 describe ovni-ai > /dev/null 2>&1; then
  pm2 restart ecosystem.config.cjs
else
  pm2 start ecosystem.config.cjs
fi
pm2 save

# 6. Health check
echo "[6/6] Verifying health..."
sleep 3
HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health || echo "000")
if [ "$HEALTH" = "200" ]; then
  echo ""
  echo "Deploy successful! Health check: 200 OK"
  echo ""
else
  echo ""
  echo "WARNING: Health check returned $HEALTH"
  echo "Check logs: pm2 logs ovni-ai"
  echo ""
  exit 1
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " Deploy complete"
echo "━━━━━━━━━━━━━━━━━���━━━━━━━���━━━━━━━━━━━━━━━━━━━━━���━━━━━"
