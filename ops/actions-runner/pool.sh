#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
case "${1:-status}" in
  start)
    ./register.sh release
    for slot in 01 02 03; do ./register.sh worker "$slot"; done
    ;;
  stop)
    # Let running jobs finish before stopping a pool.
    docker compose -p monorepo-ci stop runner
    for slot in 01 02 03; do docker compose -p "monorepo-ci-$slot" stop worker; done
    ;;
  status)
    docker compose -p monorepo-ci ps
    for slot in 01 02 03; do docker compose -p "monorepo-ci-$slot" ps; done
    ;;
  *) echo 'Usage: pool.sh [start | stop | status]' >&2; exit 2 ;;
esac
