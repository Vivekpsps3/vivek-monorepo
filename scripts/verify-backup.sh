#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
exec python3 "$root/scripts/backup-site.py" --verify "${1:?Usage: verify-backup.sh /path/to/site-backup.db}"
