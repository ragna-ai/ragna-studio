# syntax=docker/dockerfile:1

# Build from the repo root:
#   docker build -f apps/api/docker/Dockerfile .

# ============================================================
# Base: node + pnpm + turbo
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
# Pruner: extract only what @repo/api and its deps need
# ============================================================
FROM base AS pruner

COPY . .
RUN turbo prune @repo/api --docker

# ============================================================
# Builder: install deps, build, then drop dev dependencies
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
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile

# ============================================================
# Runner: Bun runtime (src/index.ts uses Bun.serve)
# ============================================================
FROM oven/bun:alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV API_PORT=3010

COPY --from=builder --chown=bun:bun /app .

USER bun

EXPOSE 3010

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://localhost:${API_PORT}/health" || exit 1

CMD ["bun", "apps/api/dist/index.mjs"]
