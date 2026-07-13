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
# Builder — install deps then build
# ============================================================
FROM base AS builder

COPY --from=pruner /app/out/json .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

COPY --from=pruner /app/out/full .
ENV NODE_ENV=production
RUN pnpm turbo build --filter=@repo/worker

# ============================================================
# Runner — dist/index.mjs is fully self-contained
# ============================================================
FROM oven/bun:1-alpine AS runner

WORKDIR /app

COPY --from=builder --chown=bun:bun /app/apps/worker/dist ./dist

USER bun

ENV NODE_ENV=production

CMD ["bun", "dist/index.mjs"]
