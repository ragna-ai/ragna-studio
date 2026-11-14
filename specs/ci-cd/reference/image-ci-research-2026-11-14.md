# Image builds in CI: research (2026-11-14)

Reference doc for #259 and #392. How comparable open-source projects decide when a pull request
builds container images, what the vendor docs recommend, and what our own CI history shows. The
recommendation built on it is in [image-ci-recommendation-2026-11-14.md](./image-ci-recommendation-2026-11-14.md).

## What breaks images and nothing else

The host CI (`build-and-check`, `api-tests`, `e2e-tests`) runs on Node and Bun outside Docker. It
catches compile errors, types, logic and UI flows. These breaks only show up in an image:

| Break class                      | Seen here                                          | Changed files                      |
| -------------------------------- | -------------------------------------------------- | ---------------------------------- |
| Package manager or turbo change  | pnpm 12 broke every image in v0.7.0 (#255, #257)   | root `package.json`, Dockerfiles   |
| Stale or missing build artefacts | stale `.nuxt` killed v0.8.0 (#390)                 | Dockerfile, `nuxt.config.ts`, deps |
| Native binary vs libc            | musl sharp on the glibc runner, `/_ipx` 500 (#392) | Dockerfile, deps                   |
| Bundler or tracer output         | `srvx` missing under Bun (#392)                    | deps, `nuxt.config.ts`, tsdown     |
| `pnpm deploy` dropping files     | drizzle SQL outside `files`                        | `package.json`                     |
| Migrations on an empty database  | #160                                               | `packages/database/drizzle/**`     |
| Base image or system library     | zlib CVE fix not picked up (#392)                  | Dockerfile (digest bumps)          |

Every one comes from the packaging surface: Dockerfiles, lockfile, `package.json` files, workspace
and turbo config, build config (`nuxt.config.ts`, tsdown), migrations, compose files.

## Our PR history

The last 40 merged pull requests (#304 to #391):

- **37** would trigger image builds under the turbo-affected rule (any change in an image's package
  or its dependencies).
- **12** touch the packaging surface. All known image breaks are among them.

## Our costs

- **Build time** from the v0.8.1 release run, registry cache warm, amd64: worker 2:19, frontend
  2:59, backend 2:37, migrate 1:06, webbrowser 1:22. arm64 is similar. The smoke test adds about a
  minute.
- **Host CI** for comparison (last 6 runs): `build-and-check` 1:51 to 2:54, `e2e-tests` 3:11 to
  4:33, `api-tests` about 3:00.
- **Money:** none. Standard GitHub-hosted runners are free in public repositories, arm64 included.
- **Real limits:** 20 concurrent jobs on the Free plan, and pull request wall-clock time.
- **Cache:** the registry cache is written only by releases. Layers that changed since the last
  release rebuild on every pull request. The first release after #393 warms the new layers (ffmpeg
  compile, Debian libraries).

## Other projects

| Project  | Pull request trigger                                                                                                                                             | What runs                                                         | Safety net                                             |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------ |
| n8n      | Packaging paths: `docker/**`, build scripts, root `package.json`, `patches/**`, `pnpm-workspace.yaml` (a gate script narrows it to native pins), build workflows | Build and native-addon smoke checks, **amd64 and arm64 natively** | Nightly full chain **without cache**                   |
| mastodon | `Dockerfile`, `.dockerignore`, build workflows                                                                                                                   | Build only                                                        | Nightly image. A `build-image` label pushes a PR image |
| dify     | Dockerfiles, dependency manifests and lockfiles, a few source dirs                                                                                               | Build, both arches                                                | none                                                   |
| twenty   | Docker package, `docker-compose.yml`, two server modules                                                                                                         | `compose up`, wait for `healthy`                                  | none                                                   |
| langfuse | Path filters                                                                                                                                                     | `buildx build --load`, then `scripts/smoke-image.sh`              | none                                                   |
| immich   | All of `server/**`, `web/**` and the lockfiles: nearly every PR                                                                                                  | Builds and **publishes** a `pr-N` image for preview environments  | n/a                                                    |

Notes:

- n8n builds both arches on pull requests because its distroless runtime assembles binaries with
  arch-specific paths: "amd64 alone can miss arm64-only runtime breaks". Our `runtime-libs` stage
  (per-arch `dpkg -L` paths) and the ffmpeg compile have the same property.
- n8n's nightly no-cache run exists because "layer caching can mask native module compilation
  failures". Their native addons compile from source. Ours are prebuilt, and our only compile
  (ffmpeg) is pinned and signature-checked.
- immich is the only project that builds on nearly every pull request. It gets something back for
  that: a published image per pull request for preview environments.

## Vendor guidance

- **Docker, test before push:** build with `load: true`, test the loaded image, then build and push.
  The push reuses the cache, so the tested platform "is only built once".
- **Docker, registry cache:** `mode=max` caches all stages of a multi-stage build. A missing
  `cache-from` ref fails only the import, the build continues.
- **GitHub, required checks:** a workflow skipped by `paths` leaves its check "Pending" and blocks
  merging. A job skipped by `if:` reports "Success". A required job that depends on others should
  use `always()` with `needs`, or a failure upstream skips it and it passes.
- **Matrix jobs as required checks** are fragile. A matrix job skipped at job level is reported once,
  without the expanded name, so a required `image-smoke (worker)` would wait forever. The common
  fix is one aggregate job with `if: always()` that fails on any `failure` or `cancelled` in
  `needs`, and only that job is required (re-actors/alls-green, matrix-org/done-action).

## Sources

- [n8n docker-build-smoke.yml](https://github.com/n8n-io/n8n/blob/master/.github/workflows/docker-build-smoke.yml)
- [mastodon test-image-build.yml](https://github.com/mastodon/mastodon/blob/main/.github/workflows/test-image-build.yml),
  [build-push-pr.yml](https://github.com/mastodon/mastodon/blob/main/.github/workflows/build-push-pr.yml),
  [build-nightly.yml](https://github.com/mastodon/mastodon/blob/main/.github/workflows/build-nightly.yml)
- [dify docker-build.yml](https://github.com/langgenius/dify/blob/main/.github/workflows/docker-build.yml)
- [twenty ci-test-docker-compose.yaml](https://github.com/twentyhq/twenty/blob/main/.github/workflows/ci-test-docker-compose.yaml)
- [langfuse pipeline.yml](https://github.com/langfuse/langfuse/blob/main/.github/workflows/pipeline.yml)
- [immich docker.yml](https://github.com/immich-app/immich/blob/main/.github/workflows/docker.yml)
- [Docker: Test before push with GitHub Actions](https://docs.docker.com/build/ci/github-actions/test-before-push/)
- [Docker: Registry cache backend](https://docs.docker.com/build/cache/backends/registry/)
- [GitHub: Troubleshooting required status checks](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/collaborating-on-repositories-with-code-quality-features/troubleshooting-required-status-checks)
- [GitHub: Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions),
  [GitHub: Actions limits](https://docs.github.com/en/actions/reference/limits)
- [Community discussion #26822: status checks for matrix jobs](https://github.com/orgs/community/discussions/26822),
  [Skippable GitHub status checks aren't really required](https://emmer.dev/blog/skippable-github-status-checks-aren-t-really-required/),
  [re-actors/alls-green](https://github.com/re-actors/alls-green), [matrix-org/done-action](https://github.com/matrix-org/done-action)
