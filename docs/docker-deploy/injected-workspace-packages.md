# Injected workspace packages (`pnpm deploy`)

## The bug

After a package upgrade + `pnpm dedupe` (2026-08-07), a fully clean rebuild
(`docker system prune -a` then `scripts/build-*.sh`) of `api`, `worker`, and
`webbrowser` all failed at runtime with errors like:

```
Cannot find package '@repo/logger' imported from /app/dist/index.mjs
Cannot find module '@repo/auth/server' from '/app/dist/index.mjs'
error: ENOENT reading "/app/node_modules/@repo/config"
```

The bug had actually existed since 2026-07-13 (commit `69a4e71b`, "fix:
build"), when `apps/worker/tsdown.config.ts` dropped
`deps: { alwaysBundle: [/.*/] }` — a workaround for a rolldown chunking
panic — in favor of `pnpm deploy --legacy`. Bundling had been hiding the
problem: once `@repo/*` stopped being inlined into `dist/index.mjs`, runtime
resolution started depending on `node_modules/@repo/*`, but nobody did a
truly clean Docker build (no layer cache, no BuildKit cache mount) until
2026-08-07, so it went unnoticed for weeks.

### Root cause

All three Dockerfiles run:

```
pnpm --filter @repo/<app> deploy --prod --legacy /prod/<app>
```

In **legacy** deploy mode, pnpm doesn't materialize `@repo/*` workspace
packages inside the deploy target — it symlinks them back to the *original
monorepo source tree*, e.g.:

```
/prod/worker/node_modules/@repo/logger -> ../../../../app/packages/logger
```

That's only valid while `/app` (the builder stage's full monorepo checkout)
still exists. The runner stage does `COPY --from=builder /prod/worker .` —
it never gets `/app`. Every `@repo/*` symlink is dangling in the final
image.

`--legacy` was only there because pnpm v10+ refuses to `deploy` a workspace
package unless `injectWorkspacePackages: true` is set, and printed
`--legacy` as the suggested escape hatch:

```
[ERR_PNPM_DEPLOY_NONINJECTED_WORKSPACE] By default, starting from pnpm v10,
we only deploy from workspaces that have "inject-workspace-packages=true" set
```

Someone took the suggested flag instead of enabling injection.

### Fix

- `pnpm-workspace.yaml`: `injectWorkspacePackages: true`
- `apps/{api,worker,webbrowser}/Dockerfile`: `pnpm deploy --prod` (no
  `--legacy`)

With injection on, `pnpm deploy --prod` copies real files for every
workspace package into the deploy target's own `node_modules/.pnpm/`,
fully self-contained — verified end to end by building and running all
three images from a completely clean Docker state.

## Fallout: code that assumed symlink-based resolution

Turning on `injectWorkspacePackages` makes pnpm *materialize* (copy) a
workspace package's files into `node_modules/.pnpm/<pkg>@file+<path>/...`
for any consumer that needs it, instead of symlinking straight to the
package's real directory. Two places in the codebase assumed the old
symlink behavior and broke:

### `packages/config/src/index.ts`

Found the monorepo root for `.env` loading via a **fixed-depth climb** from
its own compiled file:

```ts
const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../');
```

That only works if `@repo/config` always lives at
`<root>/packages/config/dist/index.mjs` — true for a symlink, false for an
injected copy nested under `node_modules/.pnpm/@repo+config@file+packages+config/...`.
The climb landed inside `.pnpm/`, `dotenv` silently loaded 0 vars, and
`ConfigService` validation failed.

**Fix**: walk up from `process.cwd()` looking for `pnpm-workspace.yaml`,
instead of climbing a fixed number of levels from the module's own file
location. `process.cwd()` is reliable here because turbo/pnpm always launch
each app's dev script with cwd set to that app's own directory. Verified
against the actual injected copy with cwd set to both `apps/api` and the
repo root — both correctly find and load the real root `.env`.

### `packages/mail/src/templates/index.ts`

Resolved the `welcome.vue` email template relative to its own compiled
file (`../src/templates`), reaching *outside* `dist/`. But
`packages/mail/package.json` has `"files": ["dist"]`, so an injected copy
only ever contains `dist/` — the template file wouldn't exist in a Docker
deploy, silently breaking `sendEmail()`.

**Fix**: `tsdown.config.ts` now has a `copy` step
(`src/templates/*.vue` → `dist/templates`), and the template path resolves
relative to `dist/templates` instead of `../src/templates`. Verified the
file lands in the injected copy after a clean install.

**General lesson**: any code that locates files relative to its own
`import.meta.url` and reaches *outside* `dist/` (via `../src/...` or a
fixed-depth `../../..` climb to the repo root) needs re-checking under
injected packages. Grep for `fileURLToPath(import.meta.url)` when adding
new packages.

## Dev-only side effect: duplicate module instances

With injection on, a workspace package can be loaded as **two separate
module instances** in the same dev process — e.g. `apps/api` imports
`@repo/config` directly (still a plain symlink, since direct "importer"
dependencies always symlink straight to source regardless of
`injectWorkspacePackages`), while `@repo/database`/`@repo/queue`/etc. (which
`apps/api` also depends on) resolve *their* `@repo/config` dependency
through the injected copy in `node_modules/.pnpm/`. Two different files on
disk → two Node module instances → `packages/config/src/index.ts`'s
top-level code (dotenv load + `new ConfigService()`) runs twice. Shows up
as a duplicate `injected env` log line, second one reporting 0 (dotenv
never overwrites an already-set var).

Harmless: `process.env` is one shared object per process, so both
`ConfigService` instances end up with identical, correctly-validated
config — just some wasted CPU (double file read, double Zod parse, double
log).

Separately, pnpm's virtual store gives a package multiple slots whenever
its resolved peer-dependency context differs across consumers — as of
2026-08-07 dev install, `@repo/ai`, `@repo/media`, and `@repo/storage` each
had two distinct `node_modules/.pnpm/@repo+<pkg>@...` slots, independent of
the config issue above.

**Neither of these reaches production.** Verified by pruning + building +
`pnpm deploy`ing `@repo/worker` exactly as the Dockerfile does and
inspecting the deployed folder: every `@repo/*` package — including the
ones with two dev-time slots — collapsed to exactly one slot. Running the
deployed `dist/index.mjs` directly showed the `injected env` log exactly
once. The full monorepo's larger, more varied dependency graph is what
creates the divergent peer-dependency resolutions; a single app's pruned,
deploy-scoped subtree doesn't have that problem. `packages/config`'s `.env`
auto-load is also gated behind `NODE_ENV !== 'production'` and never runs
in the deployed image at all.
