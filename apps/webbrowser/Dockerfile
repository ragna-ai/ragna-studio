# syntax=docker/dockerfile:1

# Build from the repo root:
#   docker build -f apps/webbrowser/Dockerfile .

# ============================================================
# Base — node + pnpm + turbo (pruning + build only; the runner
# installs its own system Chromium, so no Chrome needed here)
# ============================================================
FROM node:24-alpine AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME/bin:$PATH"
ENV TURBO_TELEMETRY_DISABLED=1
# Puppeteer's postinstall would otherwise try to download a Chrome build
# that can't run on Alpine/musl anyway — the runner uses system Chromium.
ENV PUPPETEER_SKIP_DOWNLOAD=true

WORKDIR /app

# Single source of truth for the pnpm version is package.json's
# "packageManager" field — read it instead of hardcoding it here.
COPY package.json ./

RUN apk add --no-cache libc6-compat curl \
  && PNPM_VERSION="$(sed -n 's/.*"packageManager": *"pnpm@\([0-9][0-9.]*\).*/\1/p' package.json)" \
  && curl -fsSL https://get.pnpm.io/install.sh | env PNPM_VERSION="$PNPM_VERSION" SHELL=/bin/sh ENV="$HOME/.shrc" sh - \
  && npm install -g turbo

# ============================================================
# Pruner — extract only what @repo/webbrowser and its deps need
# ============================================================
FROM base AS pruner

COPY . .
RUN turbo prune @repo/webbrowser --docker

# ============================================================
# Builder — install deps, build, then deploy with prod deps
# ============================================================
FROM base AS builder

COPY --from=pruner /app/out/json .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

COPY --from=pruner /app/out/full .
ENV NODE_ENV=production
RUN pnpm turbo build --filter=@repo/webbrowser

# Self-contained folder: webbrowser dist + production node_modules.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
  pnpm --filter @repo/webbrowser deploy --prod /prod/webbrowser

# ============================================================
# Runner — Bun on Debian + system Chromium. Bun's default/debian
# image has glibc and apt, unlike Alpine, which can't run Chrome.
# ============================================================
FROM oven/bun:debian AS runner

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium wget \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV WEBBROWSER_PORT=3011
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

COPY --from=builder --chown=bun:bun /prod/webbrowser .

USER bun

EXPOSE 3011

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://localhost:${WEBBROWSER_PORT}/health" || exit 1

CMD ["bun", "dist/index.mjs"]
