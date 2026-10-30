# syntax=docker/dockerfile:1

# Build from the repo root:
#   docker build -f apps/webbrowser/Dockerfile .

# ============================================================
# Base — node + pnpm + turbo (pruning + build only; the runner
# installs its own system Chromium, so no Chrome needed here).
# Debian slim, not Alpine: mdream ships a native addon per libc, and
# the install-time binary must be glibc to load in the runner below.
# ============================================================
FROM node:26.12.0-slim@sha256:e556a144463cc8dc53afe8de6d2fa0db5c132fd39ffa232c17641bd40df2bf11 AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME/bin:$PATH"
ENV TURBO_TELEMETRY_DISABLED=1
# The runner uses system Chromium, so the build stage needs no Chrome download.
ENV PUPPETEER_SKIP_DOWNLOAD=true

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
# image has glibc and apt, which Chromium needs.
# ============================================================
FROM oven/bun:1.4.4-debian@sha256:93d5032fe06d163427822dc1598f420363759bb18155c9cc90eb1be05a64a19e AS runner

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium wget tini \
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

# Bun as PID 1 doesn't reap orphaned Chromium helpers after the idle close.
# -s also covers pods with a shared PID namespace, where tini isn't PID 1.
ENTRYPOINT ["/usr/bin/tini", "-s", "--"]
CMD ["bun", "dist/index.mjs"]
