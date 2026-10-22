#!/usr/bin/env bash
set -euo pipefail
umask 077
root="$(cd "$(dirname "$0")/.." && pwd)"
exec python3 "$root/scripts/backup-site.py" --source "${SITE_DATA_DIR:?SITE_DATA_DIR required}/site.db" --directory "${SITE_BACKUP_DIR:?SITE_BACKUP_DIR required}"
