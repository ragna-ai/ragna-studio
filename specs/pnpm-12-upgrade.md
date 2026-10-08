## pnpm 12 upgrade: done

### Decision

Migrated on 2026-09-14. Both blockers from the original investigation (2026-08-28) cleared: Homebrew now ships a pnpm 12 formula (`12.4.1`), and npm's `latest` tag points at pnpm 12.

### What pnpm 12 is

A rewrite of pnpm from TypeScript to Rust, shipped stable on 2026-08-26 as a native per-platform binary. Same commands, flags, settings, and lockfile format as pnpm 11 (not a breaking migration). The point is speed: a warm/cached install drops from ~381ms to ~12ms because the native binary skips the Node.js bootstrap that pnpm 11's `pnpm` script pays on every invocation. Details: https://pnpm.io/blog/whats-different-in-pnpm-12

### What changed

1. **Local dev**: `brew upgrade pnpm` → `12.4.1`.
2. **`package.json`**: `packageManager` bumped from `pnpm@11.23.0+sha512...` to `pnpm@12.4.1+sha512...` (hash is the npm tarball's sha512, hex-encoded via `shasum -a 512`).
3. **`pnpm-lock.yaml`**: pnpm 12 self-manages its own binary now. The moment `packageManager` matched the installed version, running any pnpm command wrote a `packageManagerDependencies` entry plus per-platform `@pnpm/exe.*` optional packages into the lockfile. This is new v12 behavior, not something we configured, and is meant to be committed.
4. **Four Dockerfiles** (`apps/web`, `apps/api`, `apps/worker`, `apps/webbrowser`): replaced `corepack enable` with a direct standalone-binary install, since running v12 through corepack still pays the Node bootstrap cost v12 exists to remove.
   - Alpine-based (`web`, `webbrowser`): `apk add --no-cache libc6-compat curl` then the install-script line below.
   - Debian-slim-based (`api`, `worker`): `apt-get install -y --no-install-recommends curl ca-certificates` then the same install-script line.
   - Install line: `curl -fsSL https://get.pnpm.io/install.sh | env PNPM_VERSION="$PNPM_VERSION" SHELL=/bin/sh ENV="$HOME/.shrc" sh -`. `SHELL` and `ENV` are required in a Docker build context: the script's final step runs `pnpm setup`, which reads `$SHELL` to detect the shell (unset in a Docker `RUN`, causing `ERR_PNPM_UNKNOWN_SHELL`) and needs `$ENV` to point at a config file to write to (causing `ERR_PNPM_NO_SHELL_CONFIG` if unset). `/bin/sh` exists in both Alpine and Debian-slim so this line didn't need to branch per base image.
   - `PNPM_VERSION` is not hardcoded: each `base` stage does `WORKDIR /app` + `COPY package.json ./` before the install `RUN`, then extracts the version from the root `package.json`'s `"packageManager"` field with `sed -n 's/.*"packageManager": *"pnpm@\([0-9][0-9.]*\)+.*/\1/p' package.json`. Bumping pnpm now only requires editing `package.json`; all four Dockerfiles pick it up automatically. Trade-off: the `base` layer's Docker cache now invalidates whenever root `package.json` changes for _any_ reason (not just a pnpm bump), adding ~10s to those rebuilds — the alternative (a Docker `ARG` default, or wiring `--build-arg` through the four `scripts/build-*.sh` wrappers) would have left a second hardcoded version to keep in sync, or wouldn't have covered the direct `docker build -f apps/*/Dockerfile .` invocations these Dockerfiles document as supported.
   - `PATH` changed from `"$PNPM_HOME:$PATH"` to `"$PNPM_HOME/bin:$PATH"` in all four Dockerfiles. pnpm 12's standalone installer places the binary at `$PNPM_HOME/bin/pnpm` (`/pnpm/bin/pnpm`), not `$PNPM_HOME/pnpm` directly — the old `PATH` was a holdover from the corepack layout and silently pointed at nothing (`pnpm: not found`) until this was caught by an actual `docker build`.
   - `PNPM_HOME=/pnpm` itself was already set as an `ENV` in all four Dockerfiles before this change and needed no update.
   - `--resolution-only` (removed in v12) was grepped for beforehand; no usage in this repo.

### Verified locally

- `pnpm --version` → `12.4.1` inside the repo (previously errored trying to auto-provision the old `11.23.0` pin until `package.json` was bumped).
- `pnpm install` → clean, `Done in 68ms`.
- `pnpm check-types` → 19/19 tasks pass.
- `pnpm build` → 19/19 tasks pass, `@repo/web` build completes normally.
- `docker build -f apps/api/Dockerfile .` (Debian-slim, full multi-stage through the `bun` runner) → succeeds. One pre-existing, unrelated noisy warning: `msgpackr-extract`'s native rebuild fails for lack of Python/node-gyp during `pnpm deploy --prod` and falls back to its pure-JS path (it's already flagged `allowBuilds: msgpackr-extract: true` in `pnpm-workspace.yaml`, independent of this migration).
- `docker build -f apps/web/Dockerfile --target builder .` (Alpine) → succeeds, `turbo build` completes.
- After switching to reading `PNPM_VERSION` from `package.json`: re-ran `docker build --no-cache --target base` for both `apps/api` and `apps/web` and confirmed `pnpm --version` inside each image reports `12.4.1` (i.e. the extracted value, not a hardcoded one).
- `apps/worker` and `apps/webbrowser` use the same two base-image patterns (Debian-slim and Alpine respectively) already validated above and weren't rebuilt individually.

### Not yet verified

- `pnpm test:api` was not re-run under pnpm 12.
