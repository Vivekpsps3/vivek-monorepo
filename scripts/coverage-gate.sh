#!/usr/bin/env bash
# Run one backend suite and fail if statement coverage drops below the floor.
# Floors are the greatest integers the unrounded totals still meet.
# Tests and Alembic are omitted. The text report rounds to precision 0,
# so a total of 70.51% prints as 71% and still needs a floor of 70.
# pytest-cov can print "FAIL Required test coverage" without changing
# its exit code when that rounding hides the miss. The line fails the gate.
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
  finance)
    tests=apps/finance/backend/tests
    cov=apps/finance/backend
    floor=82
    ;;
  travel)
    tests=apps/travel/backend/tests
    cov=apps/travel/backend
    floor=81
    ;;
  media)
    tests=apps/media/backend/tests
    cov=apps/media/backend
    floor=70
    ;;
  server)
    tests=apps/server/tests
    cov=apps/server
    floor=21
    ;;
  *)
    echo "unknown suite: $suite" >&2
    exit 2
    ;;
esac

report=$(mktemp)
trap 'rm -f "$report"' EXIT
set +e
"$py" -m pytest -q "$tests" \
  --cov="$cov" \
  --cov-report=term \
  --cov-fail-under="$floor" | tee "$report"
status=${PIPESTATUS[0]}
set -e
if grep -q 'FAIL Required test coverage' "$report"; then
  status=1
fi

if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  {
    echo "### ${suite} backend coverage (floor ${floor}%)"
    echo
    echo '```'
    grep -E '^(Name|TOTAL|---|apps/)' "$report" || true
    echo '```'
  } >> "$GITHUB_STEP_SUMMARY"
fi

exit "$status"
