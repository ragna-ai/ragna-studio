#!/usr/bin/env bash
# Prints the image smoke legs a change needs, as a JSON list for a CI matrix:
# [{"image", "dockerfile", "platform", "runner", "slug"}, ...]
#
# Only packaging changes select an image: Dockerfiles, package.json and build
# configs, the lockfile, migrations and the files every image build shares.
# Source-only changes are covered by the host CI. arm64 legs only run when the
# runtime assembly changed (Dockerfile, smoke tests, these workflows), because
# the arch-specific steps live there; releases test both arches anyway.
#
# Usage: BASE=origin/main AFFECTED_PACKAGES="<turbo affected names>" select-legs.sh
#        select-legs.sh --all    (every image, both arches)
set -euo pipefail

# image|package|Dockerfile
IMAGES='migrate|@repo/database|packages/database/Dockerfile
backend|@repo/api|apps/api/Dockerfile
frontend|@repo/web|apps/web/Dockerfile
worker|@repo/worker|apps/worker/Dockerfile
webbrowser|@repo/webbrowser|apps/webbrowser/Dockerfile'

SHARED_FILES='package\.json|pnpm-workspace\.yaml|turbo\.json|\.dockerignore|docker/.*|\.github/workflows/release\.yml'
ARM_FILES='scripts/image-smoke/.*|\.github/workflows/(ci|image-smoke|image-smoke-label)\.yml'
BUILD_CONFIG='(apps|packages)/[^/]+/(package\.json|tsdown\.config\.ts|nuxt\.config\.ts)'

all_images=false
all_arm=false
changed=''
packaging_packages=''

if [ "${1:-}" = --all ]; then
  all_images=true
  all_arm=true
else
  changed=$(git diff --name-only "$BASE...HEAD")
  if echo "$changed" | grep -qxE "$SHARED_FILES"; then all_images=true; fi
  if echo "$changed" | grep -qxE "$ARM_FILES"; then all_images=true; all_arm=true; fi

  # A package's manifest or build config changes how every image that bundles it is built.
  config_dirs=$(echo "$changed" | grep -xE "$BUILD_CONFIG" | cut -d/ -f1,2 | sort -u || true)
  if [ -n "$config_dirs" ]; then
    turbo_version=$(jq -r .devDependencies.turbo package.json)
    filters=()
    for dir in $config_dirs; do filters+=(--filter "...{./$dir}"); done
    packaging_packages=$(npx --yes "turbo@$turbo_version" ls "${filters[@]}" --output=json |
      jq -re '.packages.items[].name')
  fi

  # turbo maps a lockfile change to the packages whose dependencies changed.
  if echo "$changed" | grep -qx 'pnpm-lock\.yaml'; then
    packaging_packages=$(printf '%s\n%s' "$packaging_packages" "${AFFECTED_PACKAGES:-}")
  fi
fi

legs='[]'
add_leg() {
  legs=$(echo "$legs" | jq -c --arg image "$1" --arg dockerfile "$2" --arg platform "linux/$3" \
    --arg runner "$4" --arg slug "linux-$3" \
    '. + [{image: $image, dockerfile: $dockerfile, platform: $platform, runner: $runner, slug: $slug}]')
}

while IFS='|' read -r image package dockerfile; do
  dockerfile_changed=false
  if echo "$changed" | grep -qxF "$dockerfile"; then dockerfile_changed=true; fi

  selected=$all_images
  if [ "$dockerfile_changed" = true ]; then selected=true; fi
  if echo "$packaging_packages" | grep -qxF "$package"; then selected=true; fi
  if [ "$image" = migrate ] && echo "$changed" | grep -q '^packages/database/drizzle/'; then selected=true; fi
  [ "$selected" = true ] || continue

  add_leg "$image" "$dockerfile" amd64 ubuntu-24.04
  if [ "$all_arm" = true ] || [ "$dockerfile_changed" = true ]; then
    add_leg "$image" "$dockerfile" arm64 ubuntu-24.04-arm
  fi
done <<< "$IMAGES"

echo "$legs"
