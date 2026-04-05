#!/usr/bin/env bash
# ─── OVNI AI — Database Backup ────────────────────────────────────────────────
# Dumps PostgreSQL, compresses, uploads to S3, and prunes old backups.
# Usage: ./scripts/backup.sh
# Cron:  0 */6 * * * /opt/ovni-ai/scripts/backup.sh >> /opt/ovni-ai/logs/backup.log 2>&1

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Load environment
if [ -f "${PROJECT_DIR}/.env" ]; then
  set -a
  source "${PROJECT_DIR}/.env"
  set +a
fi

# ── Config ────────────────────────────────────────────────────────────────────
S3_BUCKET="${BACKUP_S3_BUCKET:-ovni-ai-backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
DATE="$(date +%Y%m%d_%H%M%S)"
BACKUP_FILE="ovni-ai-db-${DATE}.sql.gz"
TMP_PATH="/tmp/${BACKUP_FILE}"

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Starting backup: ${BACKUP_FILE}"

# ── Dump ─────────────────────────────────────────────────────────────────────
pg_dump "${DATABASE_URL}" | gzip > "${TMP_PATH}"
BACKUP_SIZE=$(du -h "${TMP_PATH}" | cut -f1)
echo "  Dump complete: ${BACKUP_SIZE}"

# ── Upload to S3 ──────────────────────────────────────────────────────────────
aws s3 cp "${TMP_PATH}" "s3://${S3_BUCKET}/postgres/${BACKUP_FILE}" \
  --storage-class STANDARD_IA
echo "  Uploaded to s3://${S3_BUCKET}/postgres/${BACKUP_FILE}"

# ── Cleanup local ─────────────────────────────────────────────────────────────
rm -f "${TMP_PATH}"

# ── Prune old S3 backups ──────────────────────────────────────────────────────
echo "  Pruning backups older than ${RETENTION_DAYS} days..."

# Calculate cutoff date (cross-platform: Linux vs macOS)
if date --version >/dev/null 2>&1; then
  CUTOFF=$(date -d "${RETENTION_DAYS} days ago" +%Y%m%d)
else
  CUTOFF=$(date -v-"${RETENTION_DAYS}"d +%Y%m%d)
fi

aws s3 ls "s3://${S3_BUCKET}/postgres/" | awk '{print $4}' | while read -r file; do
  # Extract date from filename: ovni-ai-db-YYYYMMDD_HHMMSS.sql.gz
  file_date=$(echo "${file}" | grep -oE '[0-9]{8}' | head -1 || true)
  if [ -n "${file_date}" ] && [ "${file_date}" -lt "${CUTOFF}" ]; then
    aws s3 rm "s3://${S3_BUCKET}/postgres/${file}"
    echo "  Deleted old backup: ${file}"
  fi
done

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Backup complete: ${BACKUP_FILE} (${BACKUP_SIZE})"
