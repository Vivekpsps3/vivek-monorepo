#!/usr/bin/env bash
set -euo pipefail
# This socket belongs to the dedicated nested daemon, never the host daemon.
sudo chown runner:runner /run/ci-docker/docker.sock
sudo chown runner:runner /opt/runner/_work /home/runner /opt/hostedtoolcache
sudo chmod 1777 /tmp
if [[ ! -f .runner ]]; then
  echo 'Register first; see docs/LOCAL-RUNNER.md.' >&2
  exit 1
fi
cp ./bin/runsvc.sh ./runsvc.sh
exec ./runsvc.sh
