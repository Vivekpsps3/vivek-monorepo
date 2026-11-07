#!/usr/bin/env bash
# Wall-clock gates must run without coverage instrumentation; failures are fatal.
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
cd "$root"
py=${PYTHON:-"$root/.venv/bin/python"}
[[ -n "${PYTHON:-}" || -x "$py" ]] || py=python3
exec "$py" -m pytest -q -s -m perf apps/server/tests/test_town_perf.py
