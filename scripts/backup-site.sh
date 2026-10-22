#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
read -r -a docker_cmd <<< "${DOCKER_COMMAND:-docker}"
# Use the running immutable image, not a mutable development tag.
image="$("${docker_cmd[@]}" inspect personal-site-site-1 --format '{{.Image}}')"
scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT
printf 'SITE_IMAGE=%s\n' "$image" > "$scratch/image.env"
exec 9>/tmp/personal-site-deploy.lock
flock -w 30 9
"${docker_cmd[@]}" compose -p personal-site --project-directory "$root" --env-file "${SITE_ENV_FILE:-/home/vivek/Deployments/personal-site/.env}" --env-file "$scratch/image.env" -f "$root/compose.yml" --profile ops run --rm --no-deps backup
