#!/usr/bin/env bash
# Run one backend suite and fail if statement coverage drops under its floor.
# quality/coverage.txt stores the measured total and a floor about 1 point
# below it. pytest-cov enforces the floor at precision 2. A gain does not
# fail; it prints a notice with the suggested new floor.
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

# Identity moved out of Finance without changing the tests or the measured
# behavior. Keep those same source files in its original 83.28% gate.
coverage_args=(--cov="$cov")
if [[ "$suite" == finance ]]; then
  coverage_args+=(--cov=apps/server/identity --cov=apps.server.api_key --cov=apps.server.rate_limit)
fi

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
  "${coverage_args[@]}" \
  --cov-report=term \
  --cov-fail-under="$floor" | tee "$report"
status=${PIPESTATUS[0]}
set -e

measured=$(awk '/^TOTAL / { gsub(/%/, "", $NF); print $NF }' "$report")
if [[ -z "$measured" ]]; then
  echo "coverage report has no TOTAL line" >&2
  status=1
elif "$py" -c 'import sys; measured, stored = map(float, sys.argv[1:]); sys.exit(0 if measured > stored else 1)' "$measured" "$stored"; then
  suggested=$("$py" -c 'import sys; print(f"{float(sys.argv[1]) - 1:.2f}")' "$measured")
  echo "::notice::${suite} coverage rose from ${stored}% to ${measured}%. Suggested floor ${suggested}% (make coverage-pin)."
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
