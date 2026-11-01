# syntax=docker/dockerfile:1

# Build from the repo root:
#   docker build -f packages/database/Dockerfile .
#
# One-shot image, two commands: the default CMD applies pending SQL
# migrations (packages/database/drizzle) against DATABASE_URL; the `seed`
# compose service overrides it to run dist/seed/index.mjs (idempotent
# upserts) instead. Both exit when done and run ahead of api/worker
# (docker/docker-compose.yml, `depends_on: condition: service_completed_successfully`)
# so N app replicas never race a migration or seed run on boot.

# ============================================================
# Base — node + pnpm + turbo. Alpine is fine here (unlike apps/api and
# apps/worker, which need Debian's glibc for @repo/media's anydoc native
# addon): @repo/database's dependency tree (pg, drizzle-orm, @repo/workflow,
# @repo/utils) is pure JS with no native bindings.
# ============================================================
FROM node:24.22.2-alpine@sha256:8a32c8cf649a49915a66e81e7a609223c708d0adabf288ee3f4077d765542f85 AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME/bin:$PATH"
ENV TURBO_TELEMETRY_DISABLED=1

WORKDIR /app

# Single source of truth for the pnpm version is package.json's
# "packageManager" field — read it instead of hardcoding it here.
COPY package.json ./

RUN apk add --no-cache curl ca-certificates \
  && PNPM_VERSION="$(sed -n 's/.*"packageManager": *"pnpm@\([0-9][0-9.]*\).*/\1/p' package.json)" \
  && curl -fsSL https://get.pnpm.io/install.sh | env PNPM_VERSION="$PNPM_VERSION" SHELL=/bin/sh ENV="$HOME/.shrc" sh - \
  && npm install -g turbo

# ============================================================
# Pruner — extract only what @repo/database and its deps need
# ============================================================
FROM base AS pruner

COPY . .
RUN turbo prune @repo/database --docker

# ============================================================
# Builder — install deps, build, then deploy with prod deps
# ============================================================
FROM base AS builder

# Install deps from the pruned lockfile (cached layer)
COPY --from=pruner /app/out/json .
RUN --mount=type=cache,id=pnpm,target=/var/cache/pnpm pnpm install --frozen-lockfile --store-dir /var/cache/pnpm

# Copy source and build
COPY --from=pruner /app/out/full .
ENV NODE_ENV=production
RUN pnpm turbo build --filter=@repo/database

# Self-contained folder: compiled scripts + production node_modules
RUN --mount=type=cache,id=pnpm,target=/var/cache/pnpm \
  pnpm --filter @repo/database deploy --prod /prod/database --store-dir /var/cache/pnpm

# ============================================================
# Runner — minimal image for the migrate/seed one-shot commands
# ============================================================
FROM node:24.22.2-alpine@sha256:8a32c8cf649a49915a66e81e7a609223c708d0adabf288ee3f4077d765542f85 AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder --chown=node:node /prod/database .
# pnpm deploy only keeps files listed in package.json's "files" field
# (dist/); the generated SQL migrations live outside that, so pull them
# straight from the pruned source instead.
COPY --from=pruner --chown=node:node /app/out/full/packages/database/drizzle ./drizzle

USER node

CMD ["node", "dist/scripts/migrate.mjs"]
