#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
read -r -a docker_cmd <<< "${DOCKER_COMMAND:-docker}"
# Use the running immutable image, not a mutable development tag.
export SITE_IMAGE="$("${docker_cmd[@]}" inspect personal-site-site-1 --format '{{.Image}}')"
exec 9>/tmp/personal-site-deploy.lock
flock -w 30 9
exec "${docker_cmd[@]}" compose -p personal-site --project-directory "$root" --env-file "${SITE_ENV_FILE:-$root/.env}" -f "$root/compose.yml" --profile ops run --rm --no-deps backup
