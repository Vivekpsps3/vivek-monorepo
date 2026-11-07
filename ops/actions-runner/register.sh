#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
repo=Vivekpsps3/vivek-monorepo
role=${1:-release}
case "$role" in
  release)
    project=monorepo-ci
    service=runner
    runner_name=amd7600-ci
    runner_label=monorepo-ci-release
    docker compose -p "$project" up -d --wait docker
    ;;
  worker)
    slot=${2:?Usage: register.sh worker SLOT (01 through 09)}
    [[ "$slot" =~ ^0[1-9]$ ]] || { echo 'Worker slot must be 01 through 09' >&2; exit 2; }
    project="monorepo-ci-$slot"
    service=worker
    runner_name="amd7600-ci-$slot"
    runner_label=monorepo-ci
    ;;
  *) echo 'Usage: register.sh [release | worker SLOT]' >&2; exit 2 ;;
esac
# Existing registrations can be restarted without issuing another token.
if ! docker compose -p "$project" run --rm --no-deps -T --entrypoint test "$service" -f /opt/runner/.runner; then
  # The short-lived token travels over stdin, never a saved env file.
  gh api --method POST "repos/$repo/actions/runners/registration-token" --jq .token |
    docker compose -p "$project" run --rm --no-deps -T --entrypoint /bin/bash "$service" -c '
      set -euo pipefail
      IFS= read -r token
      sudo chown runner:runner /opt/runner/_work /home/runner /opt/hostedtoolcache
      sudo chmod 1777 /tmp
      ./config.sh --unattended --url https://github.com/Vivekpsps3/vivek-monorepo \
        --token "$token" --name "$1" --labels "$2" --work _work
    ' bash "$runner_name" "$runner_label"
fi
docker compose -p "$project" up -d "$service"
