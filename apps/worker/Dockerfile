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
# ffmpeg — built from source with only what the video watermark uses:
# decode common provider formats, overlay a PNG badge, encode H.264 into
# mp4 and copy the audio. Debian's ffmpeg package pulls in hundreds of
# libraries (X11, GL, audio stacks) the worker never calls.
# x264 makes the binary GPL, as Debian's is; it runs as its own process.
# ============================================================
FROM debian:13-slim@sha256:a72b4433de1cf7d6bae0c4cee74d0547f58601a643b3375f070c51600d63b6b2 AS ffmpeg

# renovate: datasource=github-tags depName=FFmpeg/FFmpeg extractVersion=^n(?<version>.+)$
ARG FFMPEG_VERSION=9.0.2
# renovate: datasource=git-refs depName=https://code.videolan.org/videolan/x264.git currentValue=stable
ARG X264_COMMIT=b35605ace3ddf7c1a5d67a2eb553f034aef41d55
ARG FFMPEG_RELEASE_FINGERPRINT=FCF986EA15E6E293A5644F10B4322F04D67658D8

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    build-essential ca-certificates curl git gnupg gpgv nasm pkg-config xz-utils zlib1g-dev \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /src

# A commit hash pins the x264 source by content.
RUN git init -q x264 \
  && git -C x264 fetch -q --depth 1 https://code.videolan.org/videolan/x264.git "$X264_COMMIT" \
  && git -C x264 checkout -q FETCH_HEAD \
  && cd x264 \
  && ./configure --prefix=/usr/local --enable-static --enable-pic --disable-cli --disable-opencl \
  && make -j"$(nproc)" \
  && make install

# The tarball must carry a valid signature from FFmpeg's release key,
# pinned by fingerprint. gpgv only trusts the exported pinned key.
RUN curl -fsSLO "https://ffmpeg.org/releases/ffmpeg-${FFMPEG_VERSION}.tar.xz" \
  && curl -fsSLO "https://ffmpeg.org/releases/ffmpeg-${FFMPEG_VERSION}.tar.xz.asc" \
  && curl -fsSL https://ffmpeg.org/ffmpeg-devel.asc | gpg --batch --import \
  && gpg --batch --export "$FFMPEG_RELEASE_FINGERPRINT" > ffmpeg-release.gpg \
  && gpgv --keyring ./ffmpeg-release.gpg "ffmpeg-${FFMPEG_VERSION}.tar.xz.asc" "ffmpeg-${FFMPEG_VERSION}.tar.xz" \
  && tar -xJf "ffmpeg-${FFMPEG_VERSION}.tar.xz"

RUN cd "ffmpeg-${FFMPEG_VERSION}" \
  && ./configure \
    --prefix=/usr/local \
    --pkg-config-flags=--static \
    --disable-everything --disable-autodetect --disable-network \
    --disable-doc --disable-debug --disable-ffplay --disable-ffprobe \
    --enable-gpl --enable-libx264 --enable-zlib \
    --enable-protocol=file,pipe \
    --enable-demuxer=mov,matroska,image2,png_pipe \
    --enable-muxer=mp4 \
    --enable-decoder=h264,hevc,vp8,vp9,png \
    --enable-parser=h264,hevc,vp8,vp9,aac,opus,png \
    --enable-bsf=aac_adtstoasc \
    --enable-encoder=libx264 \
    --enable-filter=overlay,scale,format,null,anull,buffer,buffersink,abuffer,abuffersink,aformat,aresample \
  && make -j"$(nproc)" \
  && make install \
  && strip /usr/local/bin/ffmpeg \
  && ldd /usr/local/bin/ffmpeg

# ============================================================
# Runtime libraries the distroless base lacks: libstdc++ and libgcc_s for
# sharp's libvips, zlib for ffmpeg's PNG decoder. Copy exactly the Debian
# 13 package files plus their dpkg status entries, so image scanners
# still track them.
# ============================================================
FROM debian:13-slim@sha256:a72b4433de1cf7d6bae0c4cee74d0547f58601a643b3375f070c51600d63b6b2 AS runtime-libs

# Install, not just copy: picks up Debian security updates newer than the base image.
RUN apt-get update \
  && apt-get install -y --no-install-recommends libstdc++6 libgcc-s1 zlib1g \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /rootfs/var/lib/dpkg/status.d \
  && for pkg in libstdc++6 libgcc-s1 zlib1g; do \
    dpkg -L "$pkg" | grep '^/usr/lib/.*\.so' | xargs cp -a --parents -t /rootfs; \
    dpkg -s "$pkg" > "/rootfs/var/lib/dpkg/status.d/$pkg"; \
  done

# ============================================================
# Runner — Bun distroless (no shell, no package manager). ffmpeg is
# spawned via plain PATH lookup. Numeric UID: distroless has no user
# 1000, but prod runs as 1000.
# ============================================================
FROM oven/bun:1.4.4-distroless@sha256:153a951ae40106e125898103e6e990ee0f38e6aee7f561029e26cf9fbed23470 AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY --from=runtime-libs /rootfs /
COPY --from=ffmpeg /usr/local/bin/ffmpeg /usr/local/bin/ffmpeg
COPY --from=builder --chown=1000:1000 /prod/worker .

USER 1000:1000

ENTRYPOINT []
CMD ["bun", "dist/index.mjs"]
