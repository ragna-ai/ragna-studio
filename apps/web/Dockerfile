# syntax=docker/dockerfile:1

# ============================================================
# Base — node + pnpm + turbo
# ============================================================
FROM node:24-alpine AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV TURBO_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS=--max_old_space_size=4096

RUN apk add --no-cache libc6-compat \
  && corepack enable \
  && npm install -g turbo

WORKDIR /app

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
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# Copy source and build
COPY --from=pruner /app/out/full .
ENV NODE_ENV=production
RUN pnpm turbo build --filter=@repo/web

# ============================================================
# Runner — minimal image, only .output is needed
# ============================================================
FROM node:24-alpine AS runner

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
