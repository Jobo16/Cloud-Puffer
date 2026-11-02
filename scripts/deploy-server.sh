#!/usr/bin/env bash
set -euo pipefail

# Run on the server after main has been fast-forwarded to the pushed release.
repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repo"
exec 9>/tmp/jojobot.deploy.lock
flock -n 9 || { echo "Another JOJOBOT deployment is running." >&2; exit 1; }
test "$(git branch --show-current)" = main
test -f .env.production
test -z "$(git status --porcelain)" || {
  echo "Server checkout has local changes; deployment stopped." >&2
  exit 1
}

if [[ $# != 0 ]]; then
  echo "Usage: scripts/deploy-server.sh" >&2
  exit 2
fi

release=$(git rev-parse --short HEAD)
previous=$(sed -n 's/^IMAGE_TAG=//p' .env.production)
available_kb=$(df -Pk . | awk 'NR == 2 { print $4 }')
if (( available_kb < 4 * 1024 * 1024 )); then
  echo "Less than 4 GiB free; deployment stopped before building." >&2
  exit 1
fi

IMAGE_TAG="$release" docker compose --env-file .env.production build web
docker run --rm --entrypoint node "jojobot:$release" node_modules/tsx/dist/cli.mjs --version >/dev/null
IMAGE_TAG="$release" docker compose --env-file .env.production up -d --wait postgres

backup_dir=/opt/stacks/jojobot/backups
mkdir -p -m 700 "$backup_dir"
backup="$backup_dir/$(date -u +%Y%m%dT%H%M%SZ)-$release.dump"
umask 077
trap 'rm -f "$backup.tmp"' EXIT
IMAGE_TAG="$release" docker compose --env-file .env.production exec -T postgres \
  pg_dump -U jojobot -d jojobot -Fc > "$backup.tmp"
test -s "$backup.tmp"
mv "$backup.tmp" "$backup"
trap - EXIT

IMAGE_TAG="$release" docker compose --env-file .env.production run --rm migrate

# Pin the image so a later plain 'docker compose up' cannot switch it back.
python3 - "$release" <<'PY'
import os
from pathlib import Path
import sys
import tempfile

path = Path('.env.production')
lines = path.read_text().splitlines()
lines = [line for line in lines if not line.startswith('IMAGE_TAG=')]
lines.append(f'IMAGE_TAG={sys.argv[1]}')
with tempfile.NamedTemporaryFile(mode='w', dir=path.parent, delete=False) as handle:
    os.fchmod(handle.fileno(), 0o600)
    handle.write('\n'.join(lines) + '\n')
    temp = handle.name
os.replace(temp, path)
PY

docker compose --env-file .env.production up -d --wait web worker
curl --noproxy '*' --fail --silent --show-error http://127.0.0.1:3030/api/health >/dev/null
curl --noproxy '*' --fail --silent --show-error https://fish.jobo.ink/api/health >/dev/null
worker_ready=false
for ((attempt = 0; attempt < 20; attempt++)); do
  if docker compose --env-file .env.production logs --tail=20 worker 2>&1 |
      grep -q 'Cloud Puffer worker ready'; then
    worker_ready=true
    break
  fi
  sleep 1
done
test "$worker_ready" = true

# Keep the running image and the prior release for a quick manual rollback.
while IFS= read -r image; do
  [[ $image == "jojobot:$release" || $image == "jojobot:$previous" ]] && continue
  docker image rm "$image" || echo "Could not remove unused $image" >&2
done < <(docker image ls --filter 'reference=jojobot:*' --format '{{.Repository}}:{{.Tag}}')

# BuildKit cache is shared with other projects. Pruning it never removes
# running containers, volumes, or their data, but can slow future builds.
docker builder prune --all --force --max-used-space 3GB --reserved-space 2GB
echo "JOJOBOT $release deployed and checked."
