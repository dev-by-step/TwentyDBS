#!/usr/bin/env bash

set -euo pipefail

DOKKU_SSH_HOST="${DOKKU_SSH_HOST:-vps-issa}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
OUTPUT_DIR="${OUTPUT_DIR:-.cache/dokku/${TIMESTAMP}}"

mkdir -p "$OUTPUT_DIR/apps"

run_remote() {
  ssh "$DOKKU_SSH_HOST" "$@"
}

run_remote dokku version >"${OUTPUT_DIR}/dokku-version.txt"
run_remote dokku plugin:list >"${OUTPUT_DIR}/dokku-plugin-list.txt"
run_remote dokku apps:list >"${OUTPUT_DIR}/dokku-apps-list.txt"
run_remote dokku postgres:list >"${OUTPUT_DIR}/dokku-postgres-list.txt" || true
run_remote dokku redis:list >"${OUTPUT_DIR}/dokku-redis-list.txt" || true
run_remote dokku letsencrypt:list >"${OUTPUT_DIR}/dokku-letsencrypt-list.txt" || true
run_remote df -h >"${OUTPUT_DIR}/df-h.txt"
run_remote bash -lc 'dokku apps:list --quiet 2>/dev/null || dokku apps:list | tail -n +2 | awk "{print \$1}"' >"${OUTPUT_DIR}/apps.txt"

while IFS= read -r app; do
  [[ -z "$app" ]] && continue

  run_remote dokku config:show "$app" >"${OUTPUT_DIR}/apps/${app}.config.txt" || true
  run_remote dokku domains:report "$app" >"${OUTPUT_DIR}/apps/${app}.domains.txt" || true
  run_remote dokku ps:report "$app" >"${OUTPUT_DIR}/apps/${app}.ps.txt" || true
  run_remote dokku ports:report "$app" >"${OUTPUT_DIR}/apps/${app}.ports.txt" || true
  run_remote dokku builder:report "$app" >"${OUTPUT_DIR}/apps/${app}.builder.txt" || true
  run_remote dokku builder-dockerfile:report "$app" >"${OUTPUT_DIR}/apps/${app}.dockerfile.txt" || true
  run_remote dokku storage:report "$app" >"${OUTPUT_DIR}/apps/${app}.storage.txt" || true
done <"${OUTPUT_DIR}/apps.txt"

echo "Collected Dokku state into ${OUTPUT_DIR}"
