## pnpm 12 upgrade: blocked on ecosystem, revisit later

### Decision

Not migrating yet. Investigated on 2026-08-28. Deferred until Homebrew and npm's `latest` tag both ship pnpm 12.

### What pnpm 12 is

A rewrite of pnpm from TypeScript to Rust, shipped stable on 2026-08-26 as a native per-platform binary. Same commands, flags, settings, and lockfile format as pnpm 11 (not meant to be a breaking migration). The point is speed: a warm/cached install drops from ~381ms to ~12ms because the native binary skips the Node.js bootstrap that pnpm 11's `pnpm` script pays on every invocation. Details: https://pnpm.io/blog/whats-different-in-pnpm-12

### Why corepack specifically is out

pnpm's own guidance is to install the v12 native binary directly (standalone script, or `pnpm self-update next-12`), not through corepack. Corepack is itself a Node.js wrapper: running pnpm 12 through it still launches Node first to shim into the native binary, which throws away the exact bootstrap cost v12 exists to eliminate. So migrating well means replacing `corepack enable` with a direct binary install, not just bumping the `packageManager` version string.

### Current state in this repo

- `packageManager` in `package.json` pins `pnpm@11.23.0` (with sha512 integrity).
- Local dev pnpm is installed via Homebrew (`/opt/homebrew/bin/pnpm`), not corepack — Homebrew does not have a pnpm 12 formula yet.
- Corepack is only invoked in the four app Dockerfiles (`apps/web/Dockerfile`, `apps/api/Dockerfile`, `apps/worker/Dockerfile`, `apps/webbrowser/Dockerfile`), each via `corepack enable` reading the `packageManager` field.
- No CI workflows exist in this repo (no `.github/workflows`), so there's no CI pnpm invocation to update.
- pnpm 12 is not yet on npm's `latest` tag (only `next-12`), so pinning it today means pinning an explicit pre-`latest` version, not a normal bump.
- `--resolution-only` was removed in v12 and is the one flag change that breaks CI scripts silently. Grepped this repo: no usage found, so not a blocker here.

### Why it's blocked

1. **Homebrew**: no pnpm 12 formula yet, so local dev (`brew`-installed pnpm) can't move.
2. **npm `latest` tag**: still points at pnpm 11, so any pin today has to target the `next-12` tag explicitly rather than a normal version bump.

Neither blocker is about our code; both are upstream distribution catching up.

### What migration looks like once unblocked

1. **Local dev**: `brew upgrade pnpm` (or equivalent) once the formula supports v12. No repo changes needed.
2. **`package.json`**: bump `packageManager` to the pnpm 12 version + sha512 hash (`pnpm add -g pnpm@<version>` or `corepack use pnpm@<version>` can generate the pinned string, but see next point).
3. **Dockerfiles** (all four): replace the `corepack enable` step with the standalone install script (or equivalent native-binary install), so the container doesn't pay the corepack/Node bootstrap tax that pnpm 12 is designed to remove. Check https://pnpm.io/installation for the current recommended non-corepack install snippet at migration time, since the exact command may change before v12 reaches `latest`.
4. Re-run `pnpm install`, `pnpm build`, `pnpm test:api` in each Dockerfile-built app to confirm the native binary resolves the workspace/catalog/`packageExtensions` config in `pnpm-workspace.yaml` the same way (no changes expected per pnpm's compatibility claim, but this repo has nonstandard bits like `injectWorkspacePackages`, `syncInjectedDepsAfterScripts`, and a `packageExtensions` pin for `drizzle-kit` worth double-checking).

### Revisit when

- Homebrew ships a pnpm 12 formula, **and**
- npm's `latest` tag points at pnpm 12 (or you're comfortable pinning an explicit pre-latest version for both local dev and Docker).

Check both before retrying.
