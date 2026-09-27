# CI/CD with GitHub Actions (PRD)

> **Status: decided** (2026-09-27). Phase 1 and 2 approved; phase 3 deferred.

The repo has no `.github/` folder. Nothing checks a PR before merge, and
Docker images are built and pushed by hand via `scripts/build-*.sh`
(`ghcr.io/ragna-ai/ragna-studio-*:latest`). Deploy is a manual
`make up-prod` on the server.

## Goals

- **Phase 1 (v1): CI.** Every PR and every push to `main` runs install,
  lint, type-check, and build. A red check blocks the merge.
- **Phase 2: release images.** Pushing a version tag (`v1.2.0`) builds the
  five images and pushes them to GHCR with semver tags.
- **Phase 2: image cleanup.** Old image versions are deleted automatically,
  so GHCR doesn't pile up.
- Stay inside the free tier while the repo is private.

## Non-goals

- **Auto-deploy.** Deploy stays manual (`make up-prod`). No SSH keys or
  server secrets in GitHub.
- **API tests in CI** (`pnpm test:api`). Deferred to phase 3, see
  "API tests" below. Cost is not the blocker.
- **Multi-arch images.** Production runs `linux/amd64` only. `arm64`
  stays a local build (`--platform=mac`).
- Dependabot/Renovate, CodeQL, gitleaks. Revisit if the repo goes public.
- Turbo remote cache (Vercel). The GitHub Actions cache is enough.

## Cost research (2026-09-27)

The `ragna-ai` org is on **GitHub Free**; `ragna-studio` is **private**.

### GitHub Actions minutes

- Private repos on Free: **2,000 Linux minutes/month**, no rollover.
  Public repos: standard runners are **free and unlimited**.
- Overage: **$0.006/min** for Linux 2-core (price cut on 2026-01-01).
  Spending limit defaults to $0 on Free, so jobs stop instead of billing.
- Cache: **10 GB per repo**, separate from artifacts (500 MB).
- The planned $0.002/min fee for self-hosted runners was postponed
  indefinitely. Not relevant here: we use GitHub-hosted runners.

### GHCR storage

- "Container image storage and bandwidth for the Container registry is
  **currently free**", including private images. GitHub promises at least
  one month's notice before this changes.
- Pulls from inside GitHub Actions never count toward transfer.
- The 500 MB / 1 GB quota on Free applies to npm/Maven/etc., **not** to
  container images.

### Estimate

Volume over the last 30 days: 84 commits across all branches, 8 merges to
`main`.

| Workflow | Runs/month | Minutes/run | Minutes/month |
| --- | --- | --- | --- |
| CI (phase 1) | ~60 to 90 | ~6 (estimate) | ~360 to 540 |
| API tests (phase 3) | ~60 to 90 | ~5 (estimate) | ~300 to 450 |
| Release images (phase 2) | ~2 to 4 | ~20 (5 parallel jobs, summed) | ~40 to 80 |
| Cleanup (phase 2) | ~4 | <1 | ~4 |
| **Total, all phases** | | | **~700 to 1,100** |

All three phases fit into 2,000 minutes, even with a margin. The per-run
numbers are estimates; the first real CI runs replace them.

## Phase 1: CI workflow

`.github/workflows/ci.yml`

- **Triggers:** `pull_request` (any branch) and `push` to `main`.
- **Skip docs-only changes:** `paths-ignore: ['docs/**', '**/*.md']`.
  16 of 74 non-merge commits in the last 30 days touched only docs.
- **Concurrency:** one group per branch/PR with `cancel-in-progress: true`,
  so a new push cancels the outdated run.
- **Steps**, one job on `ubuntu-latest`:
  1. `actions/checkout`
  2. `pnpm/action-setup` (reads `packageManager` from `package.json`)
  3. `actions/setup-node` with Node 24 and `cache: pnpm`
  4. `pnpm install --frozen-lockfile`
  5. Restore/save `.turbo` via `actions/cache`
  6. `pnpm lint`, `pnpm check-types`, `pnpm build`
- **Permissions:** `contents: read` only.
- **Branch protection:** require the `ci` check on `main`. Set by hand in
  the GitHub settings; not part of the repo.
- **README:** add the CI status badge.

## Phase 2: release images

`.github/workflows/release.yml`

- **Trigger:** `push` of tags matching `v*.*.*`. No builds on branch
  pushes.
- **Matrix** over the five images (`api`, `webapp`, `worker`,
  `webbrowser`, `migrate`), each with its Dockerfile path. Jobs run in
  parallel.
- **Actions:** `docker/login-action` (with `GITHUB_TOKEN`),
  `docker/setup-buildx-action`, `docker/metadata-action`,
  `docker/build-push-action`.
- **Tags** from `metadata-action`: `1.2.0`, `1.2`, and `latest`.
  `docker-compose.yml` keeps pulling `:latest`, so deploy is unchanged.
- **Layer cache:** `cache-from/cache-to: type=gha` with one `scope` per
  image, `mode=max`. Counts toward the 10 GB cache allowance; GitHub
  evicts the oldest entries first.
- **Permissions:** `contents: read`, `packages: write`.

### Build scripts

Keep `scripts/build-*.sh` for local builds (arm64 on the Mac, quick
one-off pushes). **Don't call them from the workflow:**

- They hardcode `:latest` and run plain `docker build`, without buildx
  cache export, semver tags, or OCI labels.
- The docker actions give all three with a few lines of config.
- Rewriting the scripts to fit CI would make local use more complex for no
  local benefit.

The trade-off: the image-name-to-Dockerfile mapping exists twice, in the
scripts and in the workflow matrix. It's five lines and rarely changes.

## Phase 2: image cleanup

GHCR has **no built-in retention policy**. Every pushed version stays
until deleted.

`.github/workflows/ghcr-cleanup.yml`

- **Triggers:** weekly `schedule`, `workflow_dispatch`, and at the end of
  `release.yml`.
- **Action:** `dataaxiom/ghcr-cleanup-action`.
  - Keep `latest` and the **5 newest** tagged versions per image
    (rollback window).
  - Delete untagged versions and orphans.
  - Loop over the five package names.
- **Why not `actions/delete-package-versions`:** `build-push-action`
  attaches provenance attestations by default, so even an amd64-only image
  is stored as an index with child manifests. A plain "delete untagged"
  removes those children and breaks `docker pull` of tagged images.
  `dataaxiom` and `snok/container-retention-policy` resolve the manifest
  tree first; `dataaxiom` is simpler to configure.
- **Rollout:** first run with `dry-run: true`, check the log, then switch
  it off.
- **Permissions:** `packages: write`.

## Phase 3: API tests (deferred)

Cost fits (see estimate). The work is the setup:

- Service containers for `pgvector/pgvector:0.8.6-pg18-trixie` and
  `redis:8.8.0-alpine3.23`, same images as `docker-compose.yml`.
- `oven-sh/setup-bun`, since `apps/api` tests run with `bun test`.
- `pnpm test:setup` has to run against the service containers, with a CI
  env file instead of the local `.env`.
- Run on PRs to `main` only, not on every branch push.

Write a short follow-up spec when phase 1 and 2 are live.

## To verify during implementation

- `pnpm build` and `check-types` run without a root `.env`
  (`@repo/config` loads it via `dotenv`). If not, add a minimal CI env.
- `RUN --mount=type=cache` in the Dockerfiles doesn't persist across
  GitHub runners. The `gha` layer cache covers most of it; measure before
  adding `buildkit-cache-dance`.
- `webbrowser` bundles Chromium. Check its image size against the 10 GB
  cache.
- GHCR packages are lowercase (`ragna-ai/ragna-studio-api`); the cleanup
  action needs exact names.
- The existing `:latest` images were pushed by hand. Check they're linked
  to the repo so `GITHUB_TOKEN` can push and delete them. If not, link
  them once in the package settings.

## Decisions (Sven, 2026-09-27)

1. Ship phase 1 and phase 2 together.
2. Docs-only changes (`docs/**`, `*.md`) skip CI entirely.
3. Cleanup keeps `latest` plus the 5 newest tagged versions per image.

## Sources

- [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
- [GitHub Packages billing](https://docs.github.com/en/billing/concepts/product-billing/github-packages)
- [Reduced pricing for GitHub-hosted runners (2026-01-01)](https://github.blog/changelog/2026-01-01-reduced-pricing-for-github-hosted-runners-usage/)
- [Self-hosted runner fee postponed](https://www.techzine.eu/news/devops/137396/github-bends-to-criticism-and-delays-paid-self-hosting-of-runners/)
- [actions/delete-package-versions](https://github.com/actions/delete-package-versions)
- [dataaxiom/ghcr-cleanup-action](https://github.com/marketplace/actions/ghcr-io-cleanup-action)
- [snok/container-retention-policy](https://github.com/snok/container-retention-policy)
