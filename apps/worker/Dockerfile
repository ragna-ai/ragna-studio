# syntax=docker/dockerfile:1

# ============================================================
# Base — node + pnpm + turbo
# ============================================================
FROM node:24-alpine AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV TURBO_TELEMETRY_DISABLED=1

RUN apk add --no-cache libc6-compat \
  && corepack enable \
  && npm install -g turbo

WORKDIR /app

# ============================================================
# Pruner — extract only what @repo/worker and its deps need
# ============================================================
FROM base AS pruner

COPY . .
RUN turbo prune @repo/worker --docker

# ============================================================
# Builder — install deps, build, then deploy with prod deps
# ============================================================
FROM base AS builder

# Install deps from the pruned lockfile (cached layer)
COPY --from=pruner /app/out/json .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# Copy source and build
COPY --from=pruner /app/out/full .
ENV NODE_ENV=production
RUN pnpm turbo build --filter=@repo/worker

# Self-contained folder: worker dist + production node_modules.
# Deps stay unbundled (dynamic imports and native modules need real files).
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
  pnpm --filter @repo/worker deploy --prod --legacy /prod/worker

# ============================================================
# Runner — minimal image with the deployed worker
# ============================================================
FROM oven/bun:1-alpine AS runner

WORKDIR /app

COPY --from=builder --chown=bun:bun /prod/worker .

USER bun

ENV NODE_ENV=production

CMD ["bun", "dist/index.mjs"]
