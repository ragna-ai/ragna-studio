# Image builds in CI: recommendation (2026-11-14)

Reference doc for #259 and #392. Decided by Sven on 2026-11-14 and built in PR #393. It builds on
[image-ci-research-2026-11-14.md](./image-ci-research-2026-11-14.md).

## Principles

1. **Test the artifact that ships.** The control that matters is on the release: the exact image
   digest that gets a version tag has passed the smoke test, on its own architecture. Pull request
   builds are an earlier, cheaper signal. They are not the guarantee.
2. **Run a check where its breaks start.** Image-only breaks start in the packaging surface. A
   source-only change is covered by the host CI.
3. **Required checks must not lie or hang.** A required check passes only when every leg passed or
   was deliberately skipped. It never waits for a check that will not come.
4. **Pull requests never write what releases read.** The build cache is written only by releases.
5. **Measure and adjust.** The path filter is a bet. Count the breaks it misses and widen it if it
   misses any.

## Layer 1: release gate (the guarantee)

`release.yml` already builds each image per arch on a native runner and pushes it by digest. The
version tags are only created afterwards, in the `merge` job. The gate goes in between:

- After the push, the build job smoke-tests the pushed digest (`ghcr.io/...@sha256:...`) with
  `scripts/image-smoke/run.sh`, on the same native runner.
- `merge` runs only if every smoke leg passed. A failing image never gets a version tag. Its untagged
  digest is removed by the existing GHCR cleanup.
- The worker leg loads the migrate image from the build cache, as on pull requests, so the full
  worker boot is tested too.

This tests the real bytes on both arches, not a rebuild. Cost: about 1 to 2 minutes per leg, once
per release.

## Layer 2: pull requests (fast feedback)

**Which images.** An image is selected when its packaging surface changed:

| Change                                                                                                                                | Images                                    |
| ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| The image's Dockerfile, its app's `package.json`, its build config (`nuxt.config.ts`, tsdown)                                         | that image                                |
| A workspace package's `package.json` or tsdown config                                                                                 | images whose app depends on it (turbo)    |
| `pnpm-lock.yaml`                                                                                                                      | images whose dependencies changed (turbo) |
| `packages/database/drizzle/**`                                                                                                        | migrate                                   |
| root `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.dockerignore`, `docker/`, `scripts/image-smoke/`, `ci.yml`, `release.yml` | all                                       |
| `build-images` label on the pull request                                                                                              | all                                       |

Source-only changes select nothing. On the last 40 pull requests that is 12 runs instead of 37.

**Which architectures.**

- amd64 for every selected image.
- arm64 as well when the runtime assembly changes: the image's Dockerfile, `scripts/image-smoke/`,
  `ci.yml`, or the `build-images` label. The arch-specific steps (per-arch library paths, the ffmpeg
  compile, base digests) live in the Dockerfiles. A dependency change that breaks only arm64 is
  rare and caught by the release gate.

**Required check.** One aggregate job, `images`, with `if: always()` and `needs: image-smoke`. It
fails if any leg failed or was cancelled, and passes when the matrix was skipped. Only that job is
required. The matrix legs stay visible but are not required, because a skipped matrix is reported
without its expanded names.

**Cache.** Pull requests read the release cache and never write it. That keeps code from a pull
request out of the layers a release reuses, and works for forks without secrets. Layers that changed
since the last release rebuild on every pull request until the next release.

## Not doing, and when to revisit

| Practice                           | Seen at | Why not now                                                                                         | Revisit when                                   |
| ---------------------------------- | ------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Nightly build without cache        | n8n     | Our native addons are prebuilt, the ffmpeg compile is pinned and every base image is digest-pinned. | A native addon starts compiling from source.   |
| Build images on every pull request | immich  | Only pays off when the pull request image is used, such as preview environments.                    | Preview environments exist.                    |
| e2e tests against the built images | n8n     | Larger change to `e2e-tests`. Duplicates the host build.                                            | An image-only break slips past the smoke test. |
| Trivy scan as a CI gate            | none    | A separate concern from "does it run". Fixes depend on upstream releases.                           | Own issue: report-only scan on release images. |

## Cost

| When                     | Legs                                             | Wall clock                          | Frequency                   |
| ------------------------ | ------------------------------------------------ | ----------------------------------- | --------------------------- |
| Source-only pull request | none                                             | none                                | about 70 % of pull requests |
| Packaging pull request   | 1 to 5 amd64, plus arm64 if a Dockerfile changed | 3 to 5 min, parallel to `e2e-tests` | about 30 % of pull requests |
| Release                  | 10 (5 images × 2 arches)                         | about 1 to 2 min more per leg       | every release               |

Runner minutes cost nothing in this public repository. The limit is 20 concurrent jobs, and a
packaging pull request uses at most 10 extra.

## Review

After about ten releases, look at:

- **Escapes:** release gate failures that the pull request filter let through. Each one widens the
  filter by the file that caused it.
- **Dead weight:** filter entries that never selected an image that then failed. Keep them anyway if
  a past break came from there.
- **Durations:** pull request legs that regularly take longer than `e2e-tests`.
