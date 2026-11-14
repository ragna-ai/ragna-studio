#!/usr/bin/env bash
# Smoke-tests one runtime image next to a throwaway Postgres and Redis on a
# private Docker network. Removes everything it started, also on failure.
#
# Usage: scripts/image-smoke/run.sh <image-name> <image-ref> [<migrate-image-ref>]
#   image-name: migrate | backend | frontend | worker | webbrowser (as in release.yml)
#   migrate-image-ref: worker only; migrates the database so the full worker can boot.
set -euo pipefail

IMAGE_NAME="$1"
IMAGE_REF="$2"
MIGRATE_REF="${3:-}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN_ID="image-smoke-$$"
NETWORK="$RUN_ID"
POSTGRES="$RUN_ID-postgres"
REDIS="$RUN_ID-redis"
APP="$RUN_ID-app"

# Same versions as docker/docker-compose.yml.
POSTGRES_IMAGE="pgvector/pgvector:0.8.7-pg18-trixie"
REDIS_IMAGE="redis:8.10.2-alpine3.23"

APP_ENV=(
  -e DATABASE_URL="postgres://smoke:smoke@$POSTGRES:5432/smoke"
  -e DB_HOST="$POSTGRES" -e DB_PORT=5432 -e DB_USERNAME=smoke -e DB_PASSWORD=smoke -e DB_DATABASE=smoke
  -e REDIS_HOST="$REDIS" -e REDIS_PORT=6379
  -e BETTER_AUTH_SECRET=image-smoke-only-secret-0123456789
)

cleanup() {
  docker rm -f "$APP" "$POSTGRES" "$REDIS" >/dev/null 2>&1 || true
  docker network rm "$NETWORK" >/dev/null 2>&1 || true
}
trap cleanup EXIT

fail() {
  echo "::error::$IMAGE_NAME: $1"
  docker logs "$APP" 2>&1 | tail -40 || true
  exit 1
}

start_dependencies() {
  docker network create "$NETWORK" >/dev/null
  docker run -d --name "$POSTGRES" --network "$NETWORK" \
    -e POSTGRES_USER=smoke -e POSTGRES_PASSWORD=smoke -e POSTGRES_DB=smoke \
    -v "$SCRIPT_DIR/../../docker/postgres-init.sql:/docker-entrypoint-initdb.d/01-vector.sql:ro" \
    "$POSTGRES_IMAGE" >/dev/null
  docker run -d --name "$REDIS" --network "$NETWORK" "$REDIS_IMAGE" >/dev/null
  for _ in $(seq 1 60); do
    docker exec "$POSTGRES" pg_isready -h 127.0.0.1 -U smoke -d smoke >/dev/null 2>&1 && return
    sleep 1
  done
  fail "Postgres did not become ready"
}

run_once() {
  docker run --rm --network "$NETWORK" "${APP_ENV[@]}" "$@"
}

start_app() {
  docker run -d --name "$APP" --network "$NETWORK" "${APP_ENV[@]}" "$IMAGE_REF" >/dev/null
}

wait_until_healthy() {
  local status
  for _ in $(seq 1 60); do
    status=$(docker inspect -f '{{.State.Health.Status}} {{.State.Status}}' "$APP")
    case "$status" in
      "healthy running") echo "healthy"; return ;;
      *exited*) fail "container exited before it became healthy" ;;
    esac
    sleep 2
  done
  fail "container did not become healthy ($status)"
}

wait_until_log() {
  for _ in $(seq 1 30); do
    docker logs "$APP" 2>&1 | grep -q "$1" && { echo "logged: $1"; return; }
    [ "$(docker inspect -f '{{.State.Status}}' "$APP")" = exited ] && fail "container exited during boot"
    sleep 1
  done
  fail "did not log '$1'"
}

# A stop must not wait for the kill timeout: PID 1 has to handle SIGTERM.
assert_clean_stop() {
  docker stop -t 5 "$APP" >/dev/null
  local exit_code
  exit_code=$(docker inspect -f '{{.State.ExitCode}}' "$APP")
  [ "$exit_code" = 0 ] || fail "stop exited with $exit_code instead of 0 (SIGTERM not handled?)"
  echo "clean stop"
}

assert_no_shell() {
  if docker run --rm --entrypoint sh "$IMAGE_REF" -c true >/dev/null 2>&1; then
    fail "image has a shell"
  fi
  echo "no shell"
}

assert_http_ok() {
  docker exec "$APP" bun -e "fetch('$1').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))" ||
    fail "GET $1 failed"
  echo "GET $1 ok"
}

migrate_database() {
  run_once "$1" || fail "migrate failed"
  run_once "$1" bun dist/seed/index.mjs || fail "seed failed"
  echo "migrate + seed ok"
}

start_dependencies

case "$IMAGE_NAME" in
  migrate)
    assert_no_shell
    migrate_database "$IMAGE_REF"
    ;;
  backend)
    assert_no_shell
    start_app
    wait_until_healthy
    assert_clean_stop
    ;;
  frontend)
    assert_no_shell
    start_app
    wait_until_healthy
    assert_http_ok "http://localhost:3000/_ipx/w_32/favicon.png"
    assert_clean_stop
    ;;
  webbrowser)
    start_app
    wait_until_healthy
    ;;
  worker)
    assert_no_shell
    docker run --rm --network "$NETWORK" "${APP_ENV[@]}" \
      -v "$SCRIPT_DIR/worker.mjs:/app/image-smoke.mjs:ro" \
      -v "$SCRIPT_DIR/fixtures:/fixtures:ro" \
      "$IMAGE_REF" bun image-smoke.mjs /fixtures/h264-aac.mp4 /fixtures/vp9-opus.webm ||
      fail "worker smoke script failed"
    if [ -n "$MIGRATE_REF" ]; then
      migrate_database "$MIGRATE_REF"
      start_app
      wait_until_log "Worker ready and processing jobs"
      assert_clean_stop
    fi
    ;;
  *)
    echo "Unknown image name: $IMAGE_NAME" >&2
    exit 2
    ;;
esac

echo "$IMAGE_NAME: smoke test passed"
