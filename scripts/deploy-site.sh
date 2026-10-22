#!/usr/bin/env bash
# Stateless release orchestration; all service configuration lives in compose.yml.
set -euo pipefail
umask 077
root="$(cd "$(dirname "$0")/.." && pwd)"
release="${1:?Usage: deploy-site.sh <tested-sha> <image.tar.gz>}"
archive="${2:?Image artifact required}"
[[ "$release" =~ ^[0-9a-f]{40}$ ]]
read -r -a docker_cmd <<< "${DOCKER_COMMAND:-docker}"
env_file="${SITE_ENV_FILE:-/home/vivek/Deployments/personal-site/.env}"
exec 9>/tmp/personal-site-deploy.lock
flock -w 30 9
scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT
previous="$("${docker_cmd[@]}" inspect personal-site-site-1 --format '{{.Image}}' 2>/dev/null || true)"
if [[ -n "$previous" ]]; then
  "${docker_cmd[@]}" run --rm --network none "$previous" cat /app/compose.yml > "$scratch/previous.yml"
fi
gzip -dc "$archive" | "${docker_cmd[@]}" load
image="personal-site:$release"
actual="$("${docker_cmd[@]}" image inspect "$image" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')"
test "$actual" = "$release"
printf 'SITE_IMAGE=%s\n' "$image" > "$scratch/image.env"
compose=("${docker_cmd[@]}" compose --project-directory "$root" --env-file "$env_file" --env-file "$scratch/image.env" -f "$root/compose.yml")
"${docker_cmd[@]}" run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges:true --tmpfs /tmp:rw,size=128m,mode=1777 "$image" python -m apps.server.checks
"${compose[@]}" --profile ops run --rm --no-deps backup
probe() {
  local intended="$1"
  local response=""
  for attempt in {1..30}; do
    response="$(curl -fsS --max-time 3 http://127.0.0.1:8085/health/ready || true)"
    if printf '%s' "$response" | python3 -c 'import json,sys; d=json.load(sys.stdin);sys.exit(d.get("status")!="ok" or d.get("release")!=sys.argv[1])' "$intended" 2>/dev/null; then
      for path in / /finance/ /hub /auth/login /travel/ /media/ /api/health; do
        curl -fsS --max-time 10 --resolve vivekpanchagnula.com:443:127.0.0.1 "https://vivekpanchagnula.com$path" >/dev/null || return 1
      done
      return 0
    fi
    sleep 1
  done
  return 1
}
if "${compose[@]}" up -d --no-build --wait --wait-timeout 90 && probe "$release"; then
  echo "Deployed tested release $release"
else
  "${docker_cmd[@]}" logs --tail 80 personal-site-site-1 || true
  "${docker_cmd[@]}" logs --tail 30 personal-site-maintenance-1 || true
  if [[ -n "$previous" ]]; then
    printf 'SITE_IMAGE=%s\n' "$previous" > "$scratch/image.env"
    "${docker_cmd[@]}" compose -p personal-site --project-directory "$root" --env-file "$env_file" --env-file "$scratch/image.env" -f "$scratch/previous.yml" up -d --no-build --wait --wait-timeout 90
    old_sha="$("${docker_cmd[@]}" image inspect "$previous" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')"
    probe "$old_sha"
  fi
  exit 1
fi
