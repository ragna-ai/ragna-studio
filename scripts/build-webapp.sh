#!/bin/bash

# Exit on any error
set -e

# Get the script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Configuration
IMAGE_NAME="ghcr.io/ragna-ai/ragna-studio-webapp"
TAG="latest"
DOCKERFILE="$PROJECT_ROOT/apps/web/Dockerfile"

# Get version from package.json
VERSION=$(node -p "require('$PROJECT_ROOT/package.json').version" 2>/dev/null || echo "0.0.0")

# Parse arguments
PUSH=false
PLATFORM=""
PLATFORM_AMD="linux/amd64"
PLATFORM_MAC="linux/arm64/v8"

while [[ $# -gt 0 ]]; do
  case $1 in
    --push)
      PUSH=true
      shift
      ;;
    --platform=mac)
      PLATFORM="$PLATFORM_MAC"
      shift
      ;;
    --platform=ubuntu)
      PLATFORM="$PLATFORM_AMD"
      shift
      ;;
    --platform)
      PLATFORM="$2"
      shift 2
      ;;
    --tag)
      TAG="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

echo "========================================"
echo "Building Ragna Studio Webapp Image"
echo "========================================"
echo "Image:    $IMAGE_NAME"
echo "Tag:      $TAG"
echo "Version:  $VERSION"
echo "Platform: ${PLATFORM:-auto}"
echo "========================================"

# Build platform argument only if specified
PLATFORM_ARG=""
if [ -n "$PLATFORM" ]; then
  PLATFORM_ARG="--platform $PLATFORM"
fi

# Build the image with both tags
  # --tag "$IMAGE_NAME:$VERSION" \
docker build \
  --tag "$IMAGE_NAME:$TAG" \
  --file "$DOCKERFILE" \
  $PLATFORM_ARG \
  "$PROJECT_ROOT"

echo ""
echo "Build successful!"
echo "  - $IMAGE_NAME:$TAG"

# Push if requested
if [ "$PUSH" = true ]; then
  echo ""
  echo "Pushing images..."
  docker push "$IMAGE_NAME:$TAG"
  echo "Push successful!"
fi
