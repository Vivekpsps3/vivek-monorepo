#!/usr/bin/env bash
# Rewrite quality/coverage.txt from a fresh measurement.
# The floor is 1.00 point below the measured statement total.
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

measure() {
  local suite=$1 tests=$2 cov=$3
  local report measured
  report=$(mktemp)
  "$py" -m pytest -q "$tests" --cov="$cov" --cov-report=term | tee "$report"
  measured=$(awk '/^TOTAL / { gsub(/%/, "", $NF); print $NF }' "$report")
  rm -f "$report"
  if [[ -z "$measured" ]]; then
    echo "coverage report has no TOTAL line for $suite" >&2
    exit 1
  fi
  "$py" -c 'import sys; suite, measured = sys.argv[1], float(sys.argv[2]); print(f"{suite} {measured:.2f} {measured - 1:.2f}")' "$suite" "$measured"
}

{
  echo "# Measured statement coverage and the fail-under floor."
  echo "# The floor sits about 1 percentage point below the measured total."
  echo "# coverage-gate.sh fails when a suite drops under its floor."
  echo "# A gain prints a notice and does not fail. Re-pin with: make coverage-pin"
  echo "# suite  measured  floor"
  measure finance apps/finance/backend/tests apps/finance/backend
  measure travel apps/travel/backend/tests apps/travel/backend
  measure media apps/media/backend/tests apps/media/backend
  measure server apps/server/tests apps/server
} > quality/coverage.txt
echo "wrote quality/coverage.txt"
cat quality/coverage.txt
