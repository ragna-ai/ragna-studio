# syntax=docker/dockerfile:1

# ============================================================
# Base — node + pnpm + turbo
# ============================================================
FROM node:26.13.1-slim@sha256:e6bedef217677b276c591795e169840edd9096dbf13f29df8ef8d1856b8820bc AS base

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
  && PNPM_VERSION="$(sed -n 's/.*"packageManager": *"pnpm@\([0-9][0-9.]*\).*/\1/p' package.json)" \
  && curl -fsSL https://get.pnpm.io/install.sh | env PNPM_VERSION="$PNPM_VERSION" SHELL=/bin/sh ENV="$HOME/.shrc" sh - \
  && npm install -g turbo

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
RUN --mount=type=cache,id=pnpm,target=/var/cache/pnpm pnpm install --frozen-lockfile --store-dir /var/cache/pnpm

# Copy source and build
COPY --from=pruner /app/out/full .
ENV NODE_ENV=production
RUN pnpm turbo build --filter=@repo/worker

# Self-contained folder: worker dist + production node_modules.
# Deps stay unbundled (dynamic imports and native modules need real files).
RUN --mount=type=cache,id=pnpm,target=/var/cache/pnpm \
  pnpm --filter @repo/worker deploy --prod /prod/worker --store-dir /var/cache/pnpm

# ============================================================
# Runner — minimal image with the deployed worker
# ============================================================
FROM node:26.13.1-slim@sha256:e6bedef217677b276c591795e169840edd9096dbf13f29df8ef8d1856b8820bc AS runner

WORKDIR /app

ENV NODE_ENV=production

# ffmpeg for @repo/media's watermark service (applyVideoWatermark), spawned
# via plain PATH lookup. System package, not the
# ffmpeg-static npm package.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

# npm is unused at runtime and its bundled deps carry CVEs.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

COPY --from=builder --chown=node:node /prod/worker .

USER node

CMD ["node", "dist/index.mjs"]
