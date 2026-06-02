#!/usr/bin/env bash

set -euo pipefail

require_env() {
  local var_name="$1"

  if [[ -z "${!var_name:-}" ]]; then
    echo "Missing required environment variable: ${var_name}" >&2
    exit 1
  fi
}

normalize_name() {
  local app_name="$1"

  printf '%s\n' "$app_name" | tr '[:upper:]_' '[:lower:]-'
}

validate_app_name() {
  local app_name="$1"

  if [[ ! "$app_name" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?$ ]]; then
    echo "Invalid Dokku app name: ${app_name}" >&2
    echo "Use only lowercase letters, digits, and hyphens." >&2
    exit 1
  fi
}

extract_host_from_url() {
  local url="$1"
  local without_scheme="${url#http://}"

  without_scheme="${without_scheme#https://}"
  without_scheme="${without_scheme%%/*}"

  printf '%s\n' "${without_scheme%%:*}"
}

DOKKU_SSH_HOST="${DOKKU_SSH_HOST:-vps-issa}"
APP_NAME="${APP_NAME:-}"
PG_SERVICE_NAME="${PG_SERVICE_NAME:-}"
REDIS_SERVICE_NAME="${REDIS_SERVICE_NAME:-}"
SERVER_URL="${SERVER_URL:-}"
APP_SECRET="${APP_SECRET:-$(openssl rand -hex 32)}"
STORAGE_HOST_PATH="${STORAGE_HOST_PATH:-}"

require_env APP_NAME
require_env PG_SERVICE_NAME
require_env REDIS_SERVICE_NAME
require_env SERVER_URL

NORMALIZED_APP_NAME="$(normalize_name "$APP_NAME")"
NORMALIZED_PG_SERVICE_NAME="$(normalize_name "$PG_SERVICE_NAME")"
NORMALIZED_REDIS_SERVICE_NAME="$(normalize_name "$REDIS_SERVICE_NAME")"

if [[ "$NORMALIZED_APP_NAME" != "$APP_NAME" ]]; then
  echo "Normalizing Dokku app name from ${APP_NAME} to ${NORMALIZED_APP_NAME}"
  APP_NAME="$NORMALIZED_APP_NAME"
fi

if [[ "$NORMALIZED_PG_SERVICE_NAME" != "$PG_SERVICE_NAME" ]]; then
  echo "Normalizing Dokku Postgres service name from ${PG_SERVICE_NAME} to ${NORMALIZED_PG_SERVICE_NAME}"
  PG_SERVICE_NAME="$NORMALIZED_PG_SERVICE_NAME"
fi

if [[ "$NORMALIZED_REDIS_SERVICE_NAME" != "$REDIS_SERVICE_NAME" ]]; then
  echo "Normalizing Dokku Redis service name from ${REDIS_SERVICE_NAME} to ${NORMALIZED_REDIS_SERVICE_NAME}"
  REDIS_SERVICE_NAME="$NORMALIZED_REDIS_SERVICE_NAME"
fi

validate_app_name "$APP_NAME"
validate_app_name "$PG_SERVICE_NAME"
validate_app_name "$REDIS_SERVICE_NAME"

if [[ -z "$STORAGE_HOST_PATH" ]]; then
  STORAGE_HOST_PATH="/var/lib/dokku/data/storage/${APP_NAME}-local-storage"
fi

SERVER_HOST="$(extract_host_from_url "$SERVER_URL")"
PORT_ARGS=("http:80:3000")

if [[ "$SERVER_URL" == https://* ]]; then
  PORT_ARGS+=("https:443:3000")
fi

ssh "$DOKKU_SSH_HOST" bash -s -- \
  "$APP_NAME" \
  "$PG_SERVICE_NAME" \
  "$REDIS_SERVICE_NAME" \
  "$SERVER_URL" \
  "$APP_SECRET" \
  "$STORAGE_HOST_PATH" \
  "$SERVER_HOST" \
  "${PORT_ARGS[@]}" <<'REMOTE'
set -euo pipefail

app_name="$1"
pg_service_name="$2"
redis_service_name="$3"
server_url="$4"
app_secret="$5"
storage_host_path="$6"
server_host="$7"
shift 7
port_args=("$@")

if ! dokku apps:exists "$app_name" >/dev/null 2>&1; then
  dokku apps:create "$app_name"
fi

if ! dokku postgres:info "$pg_service_name" >/dev/null 2>&1; then
  dokku postgres:create "$pg_service_name"
fi

if ! dokku redis:info "$redis_service_name" >/dev/null 2>&1; then
  dokku redis:create "$redis_service_name"
fi

# Link services to the app: required so the app container resolves the service
# DNS names (e.g. dokku-postgres-<svc>) on the same docker network. The links
# also expose PG_DATABASE_URL / REDIS_URL automatically; without them, only env
# values are set and the app cannot reach the services.
if ! dokku postgres:linked "$pg_service_name" "$app_name" >/dev/null 2>&1; then
  dokku postgres:link "$pg_service_name" "$app_name" --no-restart --alias PG_DATABASE
fi

if ! dokku redis:linked "$redis_service_name" "$app_name" >/dev/null 2>&1; then
  dokku redis:link "$redis_service_name" "$app_name" --no-restart
fi

dokku builder:set "$app_name" selected dockerfile
dokku builder-dockerfile:set "$app_name" dockerfile-path .dokku/Dockerfile
# Dokku default deploy branch is master; we deploy from main.
dokku git:set "$app_name" deploy-branch main
dokku ports:set "$app_name" "${port_args[@]}"

if [[ -n "$server_host" && ! "$server_host" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  dokku domains:set "$app_name" "$server_host"
fi

# PG_DATABASE_URL / REDIS_URL are populated by the link commands above.
dokku config:set --no-restart "$app_name" \
  APP_SECRET="$app_secret" \
  NODE_PORT=3000 \
  SERVER_URL="$server_url" \
  STORAGE_TYPE=local

sudo mkdir -p "$storage_host_path"
sudo chown -R 1000:1000 "$storage_host_path"

if ! dokku storage:list "$app_name" 2>/dev/null | grep -q '/app/packages/twenty-server/.local-storage'; then
  dokku storage:mount "$app_name" "$storage_host_path:/app/packages/twenty-server/.local-storage"
fi

dokku ps:scale "$app_name" web=1 worker=1

echo "==== builder ===="
dokku builder:report "$app_name"
echo "==== dockerfile ===="
dokku builder-dockerfile:report "$app_name"
echo "==== ports ===="
dokku ports:report "$app_name"
echo "==== domains ===="
dokku domains:report "$app_name"
echo "==== storage ===="
dokku storage:report "$app_name"
echo "==== ps ===="
dokku ps:report "$app_name"
REMOTE

echo
echo "Bootstrap completed for Dokku app: ${APP_NAME}"
echo "SERVER_URL=${SERVER_URL}"
echo "DOKKU_SSH_HOST=${DOKKU_SSH_HOST}"
