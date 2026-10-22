#!/usr/bin/env bash
# Run one backend suite and fail if statement coverage leaves its band.
# quality/coverage.txt stores the measured total and a floor about 1 point
# below it. pytest-cov enforces the floor at precision 2. A measured total
# more than 1 point above that floor is stale and has to be re-pinned.
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
cd "$root"

if [[ -n "${PYTHON:-}" ]]; then
  py="$PYTHON"
elif [[ -x "$root/.venv/bin/python" ]]; then
  py="$root/.venv/bin/python"
else
  py=python3
fi

suite=${1:?usage: coverage-gate.sh finance|travel|media|server}
case "$suite" in
  finance) tests=apps/finance/backend/tests; cov=apps/finance/backend ;;
  travel) tests=apps/travel/backend/tests; cov=apps/travel/backend ;;
  media) tests=apps/media/backend/tests; cov=apps/media/backend ;;
  server) tests=apps/server/tests; cov=apps/server ;;
  *) echo "unknown suite: $suite" >&2; exit 2 ;;
esac

read_field() {
  awk -v suite="$suite" -v field="$1" '
    $0 ~ /^#/ || NF == 0 { next }
    $1 == suite { print (field == "measured" ? $2 : $3); found = 1 }
    END { if (!found) exit 1 }
  ' quality/coverage.txt
}
stored=$(read_field measured) || { echo "quality/coverage.txt has no $suite row" >&2; exit 2; }
floor=$(read_field floor) || { echo "quality/coverage.txt has no $suite floor" >&2; exit 2; }

report=$(mktemp)
trap 'rm -f "$report"' EXIT
set +e
"$py" -m pytest -q "$tests" \
  --cov="$cov" \
  --cov-report=term \
  --cov-fail-under="$floor" | tee "$report"
status=${PIPESTATUS[0]}
set -e

measured=$(awk '/^TOTAL / { gsub(/%/, "", $NF); print $NF }' "$report")
if [[ -z "$measured" ]]; then
  echo "coverage report has no TOTAL line" >&2
  status=1
else
  if ! "$py" -c 'import sys; measured, floor = map(float, sys.argv[1:]); sys.exit(0 if measured <= floor + 1 else 1)' "$measured" "$floor"; then
    echo "${suite} coverage ${measured}% is more than 1 point above the floor ${floor}%." >&2
    echo "Raise the floor in quality/coverage.txt to about 1 point below the new total." >&2
    status=1
  fi
fi

if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  {
    echo "### ${suite} backend coverage (measured ${measured:-unknown}%, floor ${floor}%)"
    echo
    echo '```'
    grep -E '^(Name|TOTAL|---|apps/)' "$report" || true
    echo '```'
  } >> "$GITHUB_STEP_SUMMARY"
fi

exit "$status"
