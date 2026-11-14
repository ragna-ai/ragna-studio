# Runtime images: Bun everywhere, distroless where possible (design)

> Design for [prd.md](./prd.md), issue #392 (with #259 and #160).

| Image      | Runner                            | Extra                                                                          |
| ---------- | --------------------------------- | ------------------------------------------------------------------------------ |
| migrate    | `oven/bun:<v>-distroless`         | `USER 1000:1000`                                                               |
| api        | `oven/bun:<v>-distroless`         | `USER 1000:1000`, libstdc++ and libgcc_s                                       |
| web        | `oven/bun:<v>-distroless`         | Nitro bun preset, `docker-entry.mjs`, `USER 1001:1001`, libstdc++ and libgcc_s |
| worker     | `oven/bun:<v>-distroless`         | own ffmpeg, `USER 1000:1000`, libstdc++, libgcc_s and zlib                     |
| webbrowser | `oven/bun:<v>-debian` (unchanged) | chromium, tini, wget                                                           |

## Runners

- **Pins:** every `oven/bun` and `debian` reference is digest-pinned. All five runners use the same
  Bun version.
- **Users:** distroless has no users 1000 or 1001. Files are copied with numeric `--chown`, and
  `USER` is numeric. The prod manifests' `runAsUser` keeps working.
- **Entrypoint:** the distroless entrypoint is `bun`. Each image sets `ENTRYPOINT []` and
  `CMD ["bun", ...]`, so compose overrides read the same everywhere.
- **Health checks:** exec form, no shell:
  `CMD ["bun", "-e", "fetch(...).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]`.
  The port comes from `process.env` inside the script. Prod uses `httpGet` probes and ignores them.
- **Seed command:** `docker/docker-compose.yml` and ragna-infra's `ragna/migrate-job.yaml` run
  `["bun", "dist/seed/index.mjs"]`. The ragna-infra change ships with the release that carries this.

## Native libraries

sharp's libvips needs `libstdc++.so.6` and `libgcc_s.so.1`, which the distroless base lacks. anydoc
loads on plain glibc. A `debian:13-slim` stage `apt-get install`s the packages, so it picks up
Debian security updates newer than the base image. It then copies exactly the packages' `.so` files
(`dpkg -L`) plus a `var/lib/dpkg/status.d/<pkg>` entry per package into a rootfs folder. The runner
copies that folder. Trivy reads `status.d`, so the libraries stay visible to scans. `dpkg -L` paths
are per arch, so the same stage works on the native amd64 and arm64 release runners.

The apt layer refreshes when the `debian:13-slim` digest changes. Renovate bumps it in the
`runtime images` group.

## web

- **Bun preset:** the web Dockerfile sets `NITRO_PRESET=bun` for the build (`turbo.json` passes it
  through as a build env). The bun preset reads `NITRO_PORT` and `NITRO_HOST`, so the runner sets
  those instead of `NUXT_PORT` and `NUXT_HOST`.
- **Build stage on Debian slim:** the build traces sharp (for `@nuxt/image`'s `/_ipx` route) into
  `.output`. An Alpine build stage traces the musl binary, which can't load on the glibc runner.
- **`docker-entry.mjs`:** the bun preset registers no signal handler, and Bun as PID 1 ignores
  SIGTERM without one. The entry exits on SIGTERM and SIGINT, then imports the server.

## Worker ffmpeg

A `debian:13-slim` stage builds x264 and ffmpeg. The runner copies only `/usr/local/bin/ffmpeg`.

- **Sources:** x264 by git commit (content-addressed). ffmpeg's release tarball must carry a valid
  signature from FFmpeg's release key. The key's fingerprint is pinned, and `gpgv` trusts only that
  exported key.
- **Configure:** `--disable-everything --disable-autodetect --disable-network`, plus:
  - decoders h264, hevc, vp8, vp9 and png (the badge);
  - demuxers mov, matroska, image2 and png_pipe, and the mp4 muxer;
  - parsers for those codecs and aac/opus, the `aac_adtstoasc` bitstream filter;
  - the `overlay`, `scale` and `format` filters plus the graph plumbing;
  - libx264 (static) and zlib (needed by the png decoder).
- **Links:** libc, libm and libz only. zlib comes from the native library stage.
- **Upgrades:** `FFMPEG_VERSION` and `X264_COMMIT` carry `# renovate:` comments. A regex custom
  manager in `.github/renovate.json5` bumps them in the `runtime images` group.
- **License:** x264 makes the binary GPL, as Debian's `ffmpeg` is. It runs as a separate process.

## Worker on Bun

BullMQ runs under Bun: the smoke test does a queue round trip, and the real worker boots and
registers its processors and crons. The worker tests already run on `bun test`. If in-process ONNX
embedding comes (see `specs/agent/agent-context-retrieval.md`), the worker runner moves back to
`node:26-slim`, because Bun with `onnxruntime-node` is the least-tested pairing.

## Image smoke tests and CI

`scripts/image-smoke/run.sh <image-name> <image-ref> [<migrate-ref>]` starts a throwaway Postgres
and Redis on a private Docker network and removes everything on exit.

| Image      | Checks                                                                                                                                  |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| migrate    | no shell, migrate and seed on a fresh database                                                                                          |
| backend    | no shell, healthy, clean stop                                                                                                           |
| frontend   | no shell, healthy, `/_ipx` resize, clean stop                                                                                           |
| worker     | no shell, `worker.mjs` (PDF extraction, watermark of mp4 and webm fixtures, BullMQ round trip), boot on a migrated database, clean stop |
| webbrowser | healthy                                                                                                                                 |

The CI `image-smoke` job is a matrix over the affected images, amd64 only and never pushed. The
`changes` job picks an image when turbo marks its package as affected. Root files, the lockfile,
`scripts/image-smoke/`, `docker/` and `release.yml` select all images. Builds read the release's
registry cache (`buildcache-linux-amd64`) and never write it. The worker leg also builds the migrate
image, so the full worker can boot.
