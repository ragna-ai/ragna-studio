# syntax=docker/dockerfile:1

# ============================================================
# Base — node + pnpm + turbo
# ============================================================
FROM node:24.22.2-alpine@sha256:a34ab6d7f6f4813f4d0c5469d74685604b962fbdbf5793a7bc7b4998ecb867c8 AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME/bin:$PATH"
ENV TURBO_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS=--max_old_space_size=4096

WORKDIR /app

# Single source of truth for the pnpm version is package.json's
# "packageManager" field — read it instead of hardcoding it here.
COPY package.json ./

RUN apk add --no-cache libc6-compat curl \
  && PNPM_VERSION="$(sed -n 's/.*"packageManager": *"pnpm@\([0-9][0-9.]*\).*/\1/p' package.json)" \
  && curl -fsSL https://get.pnpm.io/install.sh | env PNPM_VERSION="$PNPM_VERSION" SHELL=/bin/sh ENV="$HOME/.shrc" sh - \
  && npm install -g turbo

# ============================================================
# Pruner — extract only what @repo/web and its deps need
# ============================================================
FROM base AS pruner

COPY . .
RUN turbo prune @repo/web --docker

# ============================================================
# Builder — install deps then build
# ============================================================
FROM base AS builder

# Install deps from the pruned lockfile (cached layer)
COPY --from=pruner /app/out/json .
RUN --mount=type=cache,id=pnpm,target=/var/cache/pnpm pnpm install --frozen-lockfile --store-dir /var/cache/pnpm

# Copy source and build
COPY --from=pruner /app/out/full .
ARG APP_VERSION
ENV NODE_ENV=production
ENV VITE_APP_VERSION=$APP_VERSION
# postinstall ran `nuxt prepare` before app/ existed; nuxt build reuses those stale tsconfigs.
RUN rm -rf apps/web/.nuxt && pnpm turbo build --filter=@repo/web

# ============================================================
# Runner — minimal image, only .output is needed
# ============================================================
FROM node:24.22.2-alpine@sha256:a34ab6d7f6f4813f4d0c5469d74685604b962fbdbf5793a7bc7b4998ecb867c8 AS runner

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nuxt

WORKDIR /app

COPY --from=builder --chown=nuxt:nodejs /app/apps/web/.output ./.output

USER nuxt

ENV NODE_ENV=production
ENV NUXT_HOST=0.0.0.0
ENV NUXT_PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/ || exit 1

CMD ["node", ".output/server/index.mjs"]
