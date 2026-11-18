#!/usr/bin/env bash
set -euo pipefail

if [[ $# != 3 || ! $1 =~ ^(staging|production)$ || ! $2 =~ ^ghcr\.io/jobo16/cloud-puffer@sha256:[a-f0-9]{64}$ || ! $3 =~ ^[a-f0-9]{40}$ ]]; then
  echo 'Usage: deploy.sh staging|production ghcr.io/jobo16/cloud-puffer@sha256:<digest> <commit>' >&2
  exit 2
fi
environment=$1
image_ref=$2
commit=$3
base=/opt/cloud-puffer
dir=$base/$environment
umask 077
exec 9>"$base/deploy.lock"
flock 9
test -f "$dir/.env"
config=$(mktemp -d)
next=$(mktemp "$dir/.release.next.XXXXXX")
trap 'rm -rf "$config"; rm -f "$next"' EXIT
IFS= read -r token
printf '%s' "$token" | DOCKER_CONFIG="$config" docker login ghcr.io -u jobo16 --password-stdin >/dev/null
unset token
DOCKER_CONFIG="$config" docker pull "$image_ref"

printf 'IMAGE_REF=%s\nCOMMIT=%s\n' "$image_ref" "$commit" > "$next"
export APP_ENV_FILE="$dir/.env"
compose() {
  DOCKER_CONFIG="$config" docker compose --project-directory "$dir" -f "$base/compose.yml" --env-file "$dir/.env" --env-file "$next" "$@"
}
compose up -d --wait --pull never postgres
if [[ -f $dir/.release ]]; then
  mkdir -p "$dir/backups"
  backup="$dir/backups/$(date -u +%Y%m%dT%H%M%SZ)-$commit.dump"
  compose exec -T postgres pg_dump -U jojobot -d jojobot -Fc > "$backup.tmp"
  test -s "$backup.tmp"
  mv "$backup.tmp" "$backup"
fi
compose run --rm --pull never migrate
compose up -d --wait --pull never web worker
port=$(sed -n 's/^WEB_PORT=//p' "$dir/.env")
curl --fail --silent --show-error "http://127.0.0.1:$port/api/health" >/dev/null
worker_container=$(compose ps -q worker)
worker_ready=false
for ((attempt = 0; attempt < 30; attempt++)); do
  if [[ $(docker inspect -f '{{.State.Running}}' "$worker_container") == true ]] &&
    docker logs "$worker_container" 2>&1 | grep -q 'Cloud Puffer worker ready'; then
    worker_ready=true
    break
  fi
  sleep 1
done
test "$worker_ready" = true
mv "$next" "$dir/.release"
echo "$environment deployed: $commit"
