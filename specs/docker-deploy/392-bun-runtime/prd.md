# Runtime images: Bun everywhere, distroless where possible (PRD)

> **Status: proposed** (2026-11-14). Issue #392. Follows #391 (Node 26, npm removed from runners).

The runtime images ship OS packages they never use, and Trivy reports them as HIGH findings. This PRD
moves every runner stage to Bun and, except for webbrowser, to Bun's distroless image. Build stages
stay on Node.

## Problem

Trivy (HIGH+CRITICAL) on the candidate bases, 2026-11-14:

| base                                          | critical | high |
| --------------------------------------------- | -------- | ---- |
| `oven/bun:1.4.4-debian` (api, webbrowser now) | 0        | 50   |
| `oven/bun:1.4.4-distroless` (Debian 13)       | 0        | 0    |

The findings come from Debian packages, not from the runtime. The worker image carries 284 HIGH, mostly
from the libraries that Debian's `ffmpeg` package pulls in (X11, GL, audio stacks, codecs we never use).
api and webbrowser already run on Bun. web, worker and migrate run on Node.

## Goals

- migrate, api, web and worker run on `oven/bun:distroless`. webbrowser runs on `oven/bun:debian`.
- Every service behaves as before. Prod manifests (UIDs, `httpGet` probes) need no change except the
  seed command.
- **Success signal:** the PR body lists Trivy before/after per image, and no image gets worse.

## Non-goals

- Build stages. They keep Node, pnpm, turbo, Vite and tsdown. Their layers don't ship.
- webbrowser on distroless. Chromium needs about 100 shared libraries plus fonts. Copying them by hand
  is fragile and hides their CVEs from Trivy (see Decisions).
- A `-debug` image variant with a shell.

## User stories

Roles: platform admin (operator of a RAGNA Studio instance).

### US-1 Images without unused OS packages (P1)

As a platform admin, I want the images to contain only what the services run, so that scans report
fewer findings and fewer of them are reachable.

- **US-1.1** Given the migrate, api, web and worker images, when scanned with Trivy HIGH+CRITICAL,
  then each reports no more findings than its #391 image.
- **US-1.2** Rule: migrate, api, web and worker images contain no shell and no package manager.
- **US-1.3** Given the worker image, when Trivy scans it, then the self-built ffmpeg and its codec
  library are not reported as clean by omission: the PR body names them and their versions.

### US-2 Services work as before (P1)

As a platform admin, I want every service to behave as before the switch, so that upgrading changes
nothing but the image contents.

- **US-2.1** Given an empty database, when migrate and then seed run, then both exit 0 and the model
  catalog exists.
- **US-2.2** Given a generated video, when the worker watermarks it, then the result is an mp4 that
  plays, shows the badge and keeps the audio.
- **US-2.3** Given an uploaded PDF, when the worker extracts it, then its text is searchable.
- **US-2.4** Given the compose stack, when started with `up -d --wait`, then every service with a
  health check reports healthy.
- **US-2.5** Given a service whose HTTP endpoint stops answering, when its health check runs, then the
  container reports unhealthy.
- **US-2.6** Given the prod manifests as they are today, when the new images deploy, then every pod
  becomes ready.

### US-3 Upgrades (P1)

As a platform admin, I want the upgrade steps to cover the new seed command, so that an upgrade
doesn't stop at the seed step.

- **US-3.1** Given an install upgraded with the installer's `--upgrade`, when the stack starts, then
  seed runs and exits 0.
- **US-3.2** Given a manual install that only bumps `RAGNA_VERSION`, when seed runs, then it fails,
  and the upgrade docs name the fix (download the release's compose files).

### US-4 Debugging without a shell (P2)

As a platform admin, I want a documented way to inspect a running container, so that I can debug
without `exec sh`.

- **US-4.1** Given a running api container, when the platform admin follows the self-hosting docs,
  then they get a shell that sees the container's processes, network and files.

## Testing

CI never builds images, so these run by hand before the PR leaves draft.

| Criterion      | Level                              | Where               |
| -------------- | ---------------------------------- | ------------------- |
| US-1.1, US-1.3 | Trivy scan per image               | PR body             |
| US-1.2         | `docker run --entrypoint sh` fails | local build         |
| US-2.1         | migrate + seed against local DB    | local build         |
| US-2.2, US-2.3 | worker job smoke test              | local build         |
| US-2.4, US-2.5 | compose `--wait`, stopped endpoint | local build         |
| US-2.6         | prod deploy                        | Sven, after release |
| web in browser | visual review (OAuth login)        | Sven                |
| US-3.1, US-3.2 | upgrade from previous release      | local compose       |
| US-4.1         | follow the docs recipe             | local build         |

## Standards checklist

- **Deletion:** n/a. **Retention:** n/a. **Erasure:** n/a.
- **Docs:** `self-hosting/upgrades-and-backups.mdx` (seed command note) and a new "Debugging a
  running container" section in `self-hosting/troubleshooting.mdx`.

## Decisions

**Own minimal ffmpeg build for the worker.** A build stage compiles x264 and ffmpeg from pinned,
checksummed source with only what the watermark uses. Debian's `ffmpeg` carries 284 HIGH from
libraries we never call. A prebuilt static ffmpeg would hide its libraries from Trivy instead of
removing them. The cost is compile time when the version changes (the registry build cache keeps it
otherwise) and owning the upgrades through Renovate. The binary is GPL because of x264, as Debian's
is. It runs as a separate process.

**No `node` shim in the migrate image.** Seed moves to `bun dist/seed/index.mjs` in compose and in
the prod Job. The installer's `--upgrade` and the documented manual steps both download the new
compose files. A shim would keep a second name for the runtime alive for one unusual upgrade path.

**webbrowser stays on Debian.** Chromium's dependency tree only works as Debian packages. Copied in
by hand, Trivy can't see it, and every Chromium update risks a missing library at runtime.

## Open questions

None.

## Design

| Image      | Runner                            | Extra                                                   |
| ---------- | --------------------------------- | ------------------------------------------------------- |
| migrate    | `oven/bun:<v>-distroless`         | `USER 1000:1000`                                        |
| api        | `oven/bun:<v>-distroless`         | `USER 1000:1000`, `libgcc_s` if anydoc needs it         |
| web        | `oven/bun:<v>-distroless`         | Nitro `node-server` output run by Bun, `USER 1001:1001` |
| worker     | `oven/bun:<v>-distroless`         | own ffmpeg, `USER 1000:1000`                            |
| webbrowser | `oven/bun:<v>-debian` (unchanged) | chromium, tini, wget                                    |

- **Images and pins:** all `oven/bun` tags digest-pinned, same version for all five runners.
- **Users:** distroless has no users 1000 or 1001. Files are copied with numeric `--chown`. The prod
  manifests' `runAsUser` keeps working.
- **Entrypoint:** the distroless entrypoint is `bun`. Set `ENTRYPOINT []` and `CMD ["bun", ...]`, so
  compose overrides read the same in every image.
- **Health checks:** exec form, no shell:
  `HEALTHCHECK CMD ["bun", "-e", "fetch(...).then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]`.
  The port comes from `process.env` inside the script.
- **Native libraries:** anydoc (Rust) and sharp need glibc. If either needs `libgcc_s` or `libstdc++`,
  copy them from a Debian 13 stage together with their `var/lib/dpkg/status.d` entries, so Trivy still
  sees them. Library paths differ per arch (amd64 and arm64 build natively in `release.yml`).
- **ffmpeg stage:** `--disable-everything` plus h264, hevc, vp8 and vp9 decoders, png (badge), the
  mov/mp4, matroska/webm demuxers, the mp4 muxer, the `overlay` filter and libx264. Static link, copied
  to `/usr/local/bin/ffmpeg`. Versions sit in `ARG`s that a Renovate regex manager bumps.
- **web:** Nitro's `node-server` output runs under Bun without a build change. Going back to Node is a
  one-line runner swap.
- **Worker on Bun:** BullMQ supports Bun. The worker tests already run on `bun test`. If in-process
  ONNX embedding comes (see the agent context retrieval spec), the worker runner moves back to
  `node:26-slim`, because Bun with `onnxruntime-node` is the least-tested pairing.
- **Seed command:** `docker/docker-compose.yml` and ragna-infra's `ragna/migrate-job.yaml` switch to
  `["bun", "dist/seed/index.mjs"]`. The ragna-infra change ships with the release that carries this.
