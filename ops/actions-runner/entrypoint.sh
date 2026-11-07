#!/usr/bin/env bash
set -euo pipefail
# This socket belongs to the dedicated nested daemon, never the host daemon.
if [[ -S /run/ci-docker/docker.sock ]]; then
  sudo chown runner:runner /run/ci-docker/docker.sock
fi
sudo chown runner:runner /opt/runner/_work /home/runner /opt/hostedtoolcache
sudo chmod 1777 /tmp
if [[ ! -f .runner ]]; then
  echo 'Register first; see docs/LOCAL-RUNNER.md.' >&2
  exit 1
fi
cp ./bin/runsvc.sh ./runsvc.sh
exec ./runsvc.sh
