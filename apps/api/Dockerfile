# syntax=docker/dockerfile:1

# Build from the repo root:
#   docker build -f apps/api/Dockerfile .

# ============================================================
# Base — node + pnpm + turbo. Debian slim, not Alpine: @repo/media
# depends on @firecrawl/anydoc, a Rust Node-API addon whose install-time
# platform binary is glibc-linked, so every build stage (and the runner
# below) must share libc with it, matching apps/worker/Dockerfile.
# ============================================================
FROM node:24-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME/bin:$PATH"
ENV TURBO_TELEMETRY_DISABLED=1

WORKDIR /app

# Single source of truth for the pnpm version is package.json's
# "packageManager" field — read it instead of hardcoding it here.
COPY package.json ./

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && PNPM_VERSION="$(sed -n 's/.*"packageManager": *"pnpm@\([0-9][0-9.]*\)+.*/\1/p' package.json)" \
  && curl -fsSL https://get.pnpm.io/install.sh | env PNPM_VERSION="$PNPM_VERSION" SHELL=/bin/sh ENV="$HOME/.shrc" sh - \
  && npm install -g turbo

# ============================================================
# Pruner — extract only what @repo/api and its deps need
# ============================================================
FROM base AS pruner

COPY . .
RUN turbo prune @repo/api --docker

# ============================================================
# Builder — install deps, build, then drop dev dependencies
# ============================================================
FROM base AS builder

# Install deps from the pruned lockfile (cached layer)
COPY --from=pruner /app/out/json .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# Copy source and build
COPY --from=pruner /app/out/full .
ENV NODE_ENV=production
RUN pnpm turbo build --filter=@repo/api

# Remove dev dependencies, keeping the built dist folders
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
  pnpm --filter @repo/api deploy --prod /prod/api

# ============================================================
# Runner — Bun on Debian (src/index.ts uses Bun.serve). The alpine tag
# can't load anydoc's glibc-linked binary, hence oven/bun:debian, the same
# runner apps/webbrowser uses and for the same glibc reason.
# ============================================================
FROM oven/bun:debian AS runner

WORKDIR /app

# wget for the HEALTHCHECK below: unlike the old alpine/busybox image,
# Debian's base ships neither wget nor curl.
RUN apt-get update \
  && apt-get install -y --no-install-recommends wget \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV API_PORT=3010

COPY --from=builder --chown=bun:bun /prod/api .

USER bun

EXPOSE 3010

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://localhost:${API_PORT}/health" || exit 1

CMD ["bun", "dist/index.mjs"]
