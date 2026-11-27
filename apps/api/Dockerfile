# syntax=docker/dockerfile:1

# Build from the repo root:
#   docker build -f apps/api/Dockerfile .

# ============================================================
# Base — node + pnpm + turbo. Debian slim, not Alpine: @repo/media
# depends on @firecrawl/anydoc, a Rust Node-API addon whose install-time
# platform binary is glibc-linked, so every build stage (and the runner
# below) must share libc with it, matching apps/worker/Dockerfile.
# ============================================================
FROM node:26.13.1-slim@sha256:abe7e5a82b61a8ef67b315b85497c9e65173387ccf2f4a029248184b8e020be5 AS base

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
RUN --mount=type=cache,id=pnpm,target=/var/cache/pnpm pnpm install --frozen-lockfile --store-dir /var/cache/pnpm

# Copy source and build
COPY --from=pruner /app/out/full .
ENV NODE_ENV=production
RUN pnpm turbo build --filter=@repo/api

# Remove dev dependencies, keeping the built dist folders
RUN --mount=type=cache,id=pnpm,target=/var/cache/pnpm \
  pnpm --filter @repo/api deploy --prod /prod/api --store-dir /var/cache/pnpm

# ============================================================
# GCC runtime: anydoc's Rust binary links libgcc_s, which the distroless
# base lacks. Copy exactly the Debian 13 package files plus their dpkg
# status entry, so image scanners still track them.
# ============================================================
FROM debian:13-slim@sha256:8aa5a7bf5a1955bddbe7d74fcdd0b91ab30e74362a8b73af672b0481b35b44a0 AS gcc-runtime

# Install, not just copy: picks up Debian security updates newer than the base image.
RUN apt-get update \
  && apt-get install -y --no-install-recommends libgcc-s1 \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /rootfs/var/lib/dpkg/status.d \
  && dpkg -L libgcc-s1 | grep '^/usr/lib/.*\.so' | xargs cp -a --parents -t /rootfs \
  && dpkg -s libgcc-s1 > /rootfs/var/lib/dpkg/status.d/libgcc-s1

# ============================================================
# Runner — Bun distroless (src/index.ts uses Bun.serve). Debian-based,
# so anydoc's glibc-linked binary loads; no shell, no package manager.
# Numeric UID: distroless has no user 1000, but prod runs as 1000.
# ============================================================
FROM oven/bun:1.4.5-distroless@sha256:3a210956422ad81cf7532e1fc1f2eb9275d6ef4c2337a9d25d530f798e80726a AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV API_PORT=3010

COPY --from=gcc-runtime /rootfs /
COPY --from=builder --chown=1000:1000 /prod/api .

USER 1000:1000

EXPOSE 3010

# Exec form with a fetch: distroless has no shell and no wget.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["bun", "-e", "fetch(`http://localhost:${process.env.API_PORT}/health`).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

ENTRYPOINT []
CMD ["bun", "dist/index.mjs"]
