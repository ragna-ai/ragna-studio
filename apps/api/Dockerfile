# syntax=docker/dockerfile:1

# Build from the repo root:
#   docker build -f apps/api/Dockerfile .

# ============================================================
# Base — node + pnpm + turbo. Debian slim, not Alpine: @repo/media
# depends on @firecrawl/anydoc, a Rust Node-API addon whose install-time
# platform binary is glibc-linked, so every build stage (and the runner
# below) must share libc with it, matching apps/worker/Dockerfile.
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
# C++ runtime — sharp's libvips needs libstdc++ and libgcc_s, which the
# distroless base lacks. Copy exactly the Debian 13 package files plus
# their dpkg status entries, so image scanners still track them.
# ============================================================
FROM debian:13-slim@sha256:a72b4433de1cf7d6bae0c4cee74d0547f58601a643b3375f070c51600d63b6b2 AS cxx-runtime

# Install, not just copy: picks up Debian security updates newer than the base image.
RUN apt-get update \
  && apt-get install -y --no-install-recommends libstdc++6 libgcc-s1 \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /rootfs/var/lib/dpkg/status.d \
  && for pkg in libstdc++6 libgcc-s1; do \
    dpkg -L "$pkg" | grep '^/usr/lib/.*\.so' | xargs cp -a --parents -t /rootfs; \
    dpkg -s "$pkg" > "/rootfs/var/lib/dpkg/status.d/$pkg"; \
  done

# ============================================================
# Runner — Bun distroless (src/index.ts uses Bun.serve). Debian-based,
# so anydoc's glibc-linked binary loads; no shell, no package manager.
# Numeric UID: distroless has no user 1000, but prod runs as 1000.
# ============================================================
FROM oven/bun:1.4.4-distroless@sha256:153a951ae40106e125898103e6e990ee0f38e6aee7f561029e26cf9fbed23470 AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV API_PORT=3010

COPY --from=cxx-runtime /rootfs /
COPY --from=builder --chown=1000:1000 /prod/api .

USER 1000:1000

EXPOSE 3010

# Exec form with a fetch: distroless has no shell and no wget.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["bun", "-e", "fetch(`http://localhost:${process.env.API_PORT}/health`).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

ENTRYPOINT []
CMD ["bun", "dist/index.mjs"]
