#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
repo=Vivekpsps3/vivek-monorepo
# The short-lived registration token travels over stdin, never a saved env file.
docker compose up -d --wait docker
gh api --method POST "repos/$repo/actions/runners/registration-token" --jq .token |
  docker compose run --rm --no-deps -T --entrypoint /bin/bash runner -c '
    set -euo pipefail
    IFS= read -r token
    sudo chown runner:runner /opt/runner/_work /home/runner /opt/hostedtoolcache
    sudo chmod 1777 /tmp
    ./config.sh --unattended --url https://github.com/Vivekpsps3/vivek-monorepo \
      --token "$token" --name amd7600-ci --labels monorepo-ci --work _work
  '
docker compose up -d runner
