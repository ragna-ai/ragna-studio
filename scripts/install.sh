#!/bin/sh
# Installs RAGNA Studio on localhost with Docker Compose.
#
#   curl -fsSL https://get.ragna.io | sh
#   curl -fsSL https://get.ragna.io | sh -s -- --upgrade
#
# Settings (environment variables):
#   RAGNA_DIR  install folder, default: ./ragna-studio in the current folder
#
# The first run pins the latest release as RAGNA_VERSION in .env. Compose files and images
# both come from that release. Re-runs stay on it; --upgrade moves to the newest release.

set -eu

REPO="ragna-ai/ragna-studio"
LOCAL_APP_URL="http://localhost:3000"
DOWNLOAD_FILES="docker/docker-compose.yml docker/docker-compose.selfhost.yml docker/postgres-init.sql .env.example"

info() { printf '\033[1m%s\033[0m\n' "$*"; }
warn() { printf '\033[33m%s\033[0m\n' "$*" >&2; }
fail() {
  printf '\033[31mError: %s\033[0m\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "$1 is required but not installed."
}

check_requirements() {
  require_command curl
  require_command openssl
  command -v docker >/dev/null 2>&1 || fail "Docker is required but not installed. See https://docs.docker.com/engine/install/"
  docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 is required (docker compose)."
  docker info >/dev/null 2>&1 || fail "Docker is not running."
}

usage() {
  echo "Usage: install.sh [--upgrade]"
  echo "  --upgrade  move an existing install to the latest release"
}

parse_args() {
  UPGRADE=0
  for arg in "$@"; do
    case $arg in
      --upgrade) UPGRADE=1 ;;
      --help | -h)
        usage
        exit 0
        ;;
      *)
        usage >&2
        fail "Unknown option: $arg"
        ;;
    esac
  done
}

# A fresh .env next to existing volumes would hold new DB and Redis passwords that the old data doesn't accept.
is_installer_dir() {
  [ -f "$INSTALL_DIR/.env" ] && grep -q '^RAGNA_VERSION=' "$INSTALL_DIR/.env"
}

existing_install_dir() {
  container=$(docker ps -aq --filter label=com.docker.compose.project=ragna_studio | head -n 1)
  [ -n "$container" ] || return 0
  docker inspect "$container" --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}'
}

ensure_install_dir_matches() {
  is_installer_dir && return
  [ -f "$INSTALL_DIR/.env" ] && fail "$INSTALL_DIR/.env was not created by this installer. Use another folder or set RAGNA_DIR."
  [ "$UPGRADE" = 1 ] && fail "No install found in $INSTALL_DIR. Run from the folder that contains ragna-studio, or set RAGNA_DIR."
  docker volume inspect ragna_studio_postgres_data >/dev/null 2>&1 || return 0

  existing=$(existing_install_dir)
  [ -n "$existing" ] && fail "RAGNA Studio is already set up in $existing. Use that install, or set RAGNA_DIR to it."
  fail "RAGNA Studio data already exists on this machine (Docker volume ragna_studio_postgres_data). Run from the folder that contains ragna-studio, or set RAGNA_DIR."
}

# Image tags drop the leading "v" of the git tag (v0.5.0 -> 0.5.0).
resolve_latest_version() {
  tag=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" |
    sed -n 's/.*"tag_name": *"v\([^"]*\)".*/\1/p')
  [ -n "$tag" ] || fail "Could not find the latest release."
  echo "$tag"
}

resolve_version() {
  if [ "$UPGRADE" = 1 ] || ! is_installer_dir; then
    resolve_latest_version
    return
  fi
  read_env RAGNA_VERSION
}

download_files() {
  version=$1
  mkdir -p "$INSTALL_DIR/docker"
  for file in $DOWNLOAD_FILES; do
    curl -fsSL "https://raw.githubusercontent.com/$REPO/v$version/$file" -o "$INSTALL_DIR/$file" ||
      fail "Download failed: $file (v$version)"
  done
}

# Single quotes keep compose from expanding `$` inside values.
set_env() {
  key=$1
  value=$2
  case $value in *"'"*) fail "$key must not contain a single quote." ;; esac

  env_file="$INSTALL_DIR/.env"
  if grep -q "^$key=" "$env_file"; then
    KEY="$key" VALUE="$value" awk '
      index($0, ENVIRON["KEY"] "=") == 1 { print ENVIRON["KEY"] "='\''" ENVIRON["VALUE"] "'\''"; next }
      { print }
    ' "$env_file" >"$env_file.tmp"
    chmod 600 "$env_file.tmp"
    mv "$env_file.tmp" "$env_file"
  else
    printf "%s='%s'\n" "$key" "$value" >>"$env_file"
  fi
}

read_env() {
  sed -n "s/^$1=//p" "$INSTALL_DIR/.env" | tail -n 1 | sed "s/^[\"']//; s/[\"']\$//"
}

has_tty() {
  (: </dev/tty) 2>/dev/null
}

# Reads from /dev/tty because stdin is the script itself under `curl | sh`.
prompt() {
  printf '%s: ' "$1" >/dev/tty
  IFS= read -r answer </dev/tty
  echo "$answer"
}

prompt_secret() {
  printf '%s: ' "$1" >/dev/tty
  stty -echo </dev/tty
  IFS= read -r answer </dev/tty
  stty echo </dev/tty
  printf '\n' >/dev/tty
  echo "$answer"
}

set_env_if_given() {
  [ -n "$2" ] && set_env "$1" "$2"
  return 0
}

create_env_file() {
  cp "$INSTALL_DIR/.env.example" "$INSTALL_DIR/.env"
  chmod 600 "$INSTALL_DIR/.env"
  set_env BETTER_AUTH_SECRET "$(openssl rand -hex 32)"
  set_env ENCRYPTION_PASSWORD "$(openssl rand -hex 32)"
  set_env DB_PASSWORD "$(openssl rand -hex 24)"
  set_env REDIS_PASSWORD "$(openssl rand -hex 24)"
}

url_host() {
  echo "$1" | sed 's#^[a-z]*://##; s#[:/].*##'
}

normalize_url() {
  url=${1%/}
  case $url in http://* | https://*) echo "$url" ;; *) fail "Not a URL: $1" ;; esac
}

# The cookie domain is the app host or its parent, whichever the API host sits under:
# app.example.com + api.example.com -> .example.com, example.com + api.example.com -> .example.com
shared_cookie_domain() {
  app_host=$(url_host "$1")
  api_host=$(url_host "$2")
  for candidate in "$app_host" "${app_host#*.}"; do
    case $candidate in *.*) ;; *) continue ;; esac
    case $api_host in *."$candidate")
      echo ".$candidate"
      return
      ;;
    esac
  done
}

ask_domains() {
  info "Domains"
  echo "Press Enter to run on localhost. On a server, enter the public URLs of your reverse proxy."
  app_url=$(prompt "App URL (default: $LOCAL_APP_URL)")
  if [ -z "$app_url" ]; then
    echo
    return
  fi
  app_url=$(normalize_url "$app_url")
  api_url=$(normalize_url "$(prompt "API URL, e.g. https://api.example.com")")

  set_env APP_URL "$app_url"
  set_env TRUSTED_ORIGINS "$app_url"
  set_env NUXT_PUBLIC_I18N_BASE_URL "$app_url"
  set_env API_BASE_URL "$api_url"
  set_env NUXT_PUBLIC_API_BASE_URL "$api_url"

  cookie_domain=$(shared_cookie_domain "$app_url" "$api_url")
  if [ -n "$cookie_domain" ]; then
    set_env COOKIE_DOMAIN "$cookie_domain"
  else
    warn "App and API don't share a parent domain. Set COOKIE_DOMAIN in .env yourself, see https://docs.ragna.io/self-hosting/configuration#domains"
  fi
  echo
}

ask_oauth() {
  info "Sign-in (OAuth)"
  echo "Create an OAuth client at Google or Microsoft first. See https://docs.ragna.io/self-hosting/configuration#oauth"
  provider=$(prompt "Provider [google/microsoft] (default: google)")
  provider=${provider:-google}
  case $provider in
    google)
      set_env_if_given GOOGLE_CLIENT_ID "$(prompt "Google client ID")"
      set_env_if_given GOOGLE_CLIENT_SECRET "$(prompt_secret "Google client secret")"
      ;;
    microsoft)
      set_env_if_given MICROSOFT_CLIENT_ID "$(prompt "Microsoft client ID")"
      set_env_if_given MICROSOFT_CLIENT_SECRET "$(prompt_secret "Microsoft client secret")"
      ;;
    *) fail "Unknown provider: $provider" ;;
  esac
  echo "Redirect URI for your OAuth client: $(read_env API_BASE_URL)/auth/callback/$provider"
  echo
}

ask_storage() {
  info "Storage (S3-compatible)"
  echo "Storage needs two buckets: a public-read one for images, a private one for documents."
  echo "See https://docs.ragna.io/self-hosting/storage"
  echo "Press Enter to skip. Without storage, file uploads and image/video generation won't work."
  endpoint=$(prompt "Endpoint URL")
  if [ -z "$endpoint" ]; then
    echo
    return
  fi
  set_env S3_ENDPOINT "$endpoint"
  set_env_if_given S3_REGION "$(prompt "Region (default: auto)")"
  set_env_if_given S3_ACCESS_KEY_ID "$(prompt "Access key ID")"
  set_env_if_given S3_SECRET_ACCESS_KEY "$(prompt_secret "Secret access key")"
  set_env_if_given S3_IMAGES_BUCKET_NAME "$(prompt "Images bucket name")"
  set_env_if_given S3_DOCUMENTS_BUCKET_NAME "$(prompt "Documents bucket name")"
  media_url=$(prompt "Public URL of the images bucket")
  set_env_if_given MEDIA_URL "$media_url"
  set_env_if_given NUXT_PUBLIC_MEDIA_URL "$media_url"
  echo
}

ask_ai_keys() {
  info "AI providers"
  echo "Enter at least one key. Press Enter to skip a provider."
  set_env_if_given ANTHROPIC_API_KEY "$(prompt_secret "Anthropic API key")"
  set_env_if_given OPENAI_API_KEY "$(prompt_secret "OpenAI API key")"
  set_env_if_given GOOGLE_GENAI_API_KEY "$(prompt_secret "Google Gemini API key")"
  set_env_if_given MISTRAL_API_KEY "$(prompt_secret "Mistral API key")"
  echo
}

missing_settings() {
  if [ -z "$(read_env GOOGLE_CLIENT_ID)" ] && [ -z "$(read_env MICROSOFT_CLIENT_ID)" ]; then
    echo "GOOGLE_CLIENT_ID or MICROSOFT_CLIENT_ID"
  fi
  if [ -n "$(read_env S3_ENDPOINT)" ]; then
    for key in S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY S3_IMAGES_BUCKET_NAME S3_DOCUMENTS_BUCKET_NAME MEDIA_URL; do
      [ -n "$(read_env "$key")" ] || echo "$key"
    done
  fi
  if [ -z "$(read_env ANTHROPIC_API_KEY)$(read_env OPENAI_API_KEY)$(read_env GOOGLE_GENAI_API_KEY)$(read_env MISTRAL_API_KEY)" ]; then
    echo "one AI key (ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_GENAI_API_KEY or MISTRAL_API_KEY)"
  fi
}

compose() {
  docker compose --project-directory "$INSTALL_DIR" \
    -f "$INSTALL_DIR/docker/docker-compose.yml" \
    -f "$INSTALL_DIR/docker/docker-compose.selfhost.yml" \
    "$@"
}

start_stack() {
  info "Starting RAGNA Studio..."
  compose pull
  compose up -d --wait --wait-timeout 300 ||
    fail "RAGNA Studio did not start. Check the logs: docker compose -p ragna_studio logs"
}

main() {
  parse_args "$@"
  INSTALL_DIR=${RAGNA_DIR:-"$PWD/ragna-studio"}

  check_requirements
  ensure_install_dir_matches
  version=$(resolve_version)
  info "Installing RAGNA Studio $version into $INSTALL_DIR"
  download_files "$version"

  if [ ! -f "$INSTALL_DIR/.env" ]; then
    create_env_file
    set_env RAGNA_VERSION "$version"
    if has_tty; then
      trap 'stty echo </dev/tty 2>/dev/null' EXIT INT TERM
      echo
      ask_domains
      ask_oauth
      ask_storage
      ask_ai_keys
    fi
  elif [ "$UPGRADE" = 1 ]; then
    set_env RAGNA_VERSION "$version"
  fi

  missing=$(missing_settings)
  if [ -n "$missing" ]; then
    warn "These settings are missing in $INSTALL_DIR/.env:"
    echo "$missing" | sed 's/^/  - /' >&2
    warn "Fill them in, then run the installer again."
    exit 1
  fi
  if [ -z "$(read_env S3_ENDPOINT)" ]; then
    warn "No storage configured: file uploads and image/video generation won't work. Set the S3_* values in $INSTALL_DIR/.env to enable them."
  fi

  start_stack
  echo
  app_url=$(read_env APP_URL)
  info "RAGNA Studio is running at $app_url"
  [ "$app_url" = "$LOCAL_APP_URL" ] || echo "Until your reverse proxy is set up: $LOCAL_APP_URL on this machine"
  echo "Settings: $INSTALL_DIR/.env"
  echo "Upgrade:  curl -fsSL https://get.ragna.io | sh -s -- --upgrade"
  echo "Logs:     docker compose -p ragna_studio logs -f"
  echo "Stop:     docker compose -p ragna_studio down"
}

main "$@"
