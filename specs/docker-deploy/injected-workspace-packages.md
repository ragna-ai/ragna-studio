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
packages inside the deploy target — it symlinks them back to the _original
monorepo source tree_, e.g.:

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

Turning on `injectWorkspacePackages` makes pnpm _materialize_ (copy) a
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
file (`../src/templates`), reaching _outside_ `dist/`. But
`packages/mail/package.json` has `"files": ["dist"]`, so an injected copy
only ever contains `dist/` — the template file wouldn't exist in a Docker
deploy, silently breaking `sendEmail()`.

**Fix**: `tsdown.config.ts` now has a `copy` step
(`src/templates/*.vue` → `dist/templates`), and the template path resolves
relative to `dist/templates` instead of `../src/templates`. Verified the
file lands in the injected copy after a clean install.

**General lesson**: any code that locates files relative to its own
`import.meta.url` and reaches _outside_ `dist/` (via `../src/...` or a
fixed-depth `../../..` climb to the repo root) needs re-checking under
injected packages. Grep for `fileURLToPath(import.meta.url)` when adding
new packages.

## Dev-only side effect: duplicate module instances

With injection on, a workspace package can be loaded as **two separate
module instances** in the same dev process — e.g. `apps/api` imports
`@repo/config` directly (still a plain symlink, since direct "importer"
dependencies always symlink straight to source regardless of
`injectWorkspacePackages`), while `@repo/database`/`@repo/queue`/etc. (which
`apps/api` also depends on) resolve _their_ `@repo/config` dependency
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

**Caveat on the verification above**: it was done by `rm -rf node_modules`
at the repo root only. pnpm workspaces keep a _separate_ `node_modules/`
inside every app and package directory (`apps/api/node_modules/`,
`packages/testing/node_modules/`, etc.) — deleting only the root one leaves
all of those untouched, so a subsequent `pnpm install` can silently reuse
stale, pre-`injectWorkspacePackages` per-package symlinks instead of
re-resolving them under the new setting. The dual-instance conclusion above
was drawn against that partially-stale state. The bug in the next section
was found _because_ a properly full clean install (every per-package
`node_modules` removed, not just the root one) produces different, and
worse, results — so the "harmless, dev-only" verdict above should be
treated as unconfirmed until re-checked the same thorough way.

## Real bug: `@repo/testing`'s LinkedIn mock silently stops working

Found via a genuinely full clean install (`find . -maxdepth 3 -iname
node_modules ... -exec rm -rf {} +`, not just the root one — see caveat
above). `apps/api/test/social-post/social-posts.test.ts`'s "publishes
through the faked LinkedIn client" test started failing: the app made a
real network call to LinkedIn's API (401 Unauthorized) instead of using
`@repo/testing`'s `linkedin-provider.mock.ts` fake.

### Root cause

`packages/testing` has no `"files"` restriction in its `package.json` (it
ships its whole `src/` tree, unlike the built packages). Once
`injectWorkspacePackages: true` is on, pnpm doesn't just decide
package-by-package whether to inject — it rewrites _every_ `workspace:*`
dependency in the lockfile from a plain `link:../../packages/X` entry
(always a live symlink, content is whatever's on disk right now) to a
`file:packages/X(...peer-hash...)` entry (resolved like a normal
content-addressable dependency, cloned into `node_modules/.pnpm/` at
install time). Once something is a `file:` dependency, pnpm's ordinary
virtual-store logic — the same mechanism that gives `@repo/ai`,
`@repo/media`, and `@repo/storage` multiple slots when their peer
resolution diverges across consumers — can and does materialize a real,
frozen copy of it, independent of any injection intent. `@repo/testing`
pulls in a wide, divergent dependency tree (`better-auth`, `ai`, multiple
optional DB-driver peers via `@repo/database`), so it gets its own
`node_modules/.pnpm/@repo+testing@file+packages+testing_<peer-hash>/`
slot, materialized as a real copy — confirmed by diffing it against
`packages/testing/src/`: it's an independent, frozen snapshot, not a
symlink back to source.

That copy's own `mock.module('@repo/linkedin', ...)` call (in its own
`linkedin-provider.mock.ts`) resolves `@repo/linkedin` through _its own_
node_modules chain
(`.pnpm/@repo+testing@.../node_modules/@repo/linkedin` →
`.pnpm/@repo+linkedin@file+packages+linkedin/node_modules/@repo/linkedin`),
which is a different resolved path than what
`apps/api/src/services/social-post.service.ts` uses directly
(`apps/api/node_modules/@repo/linkedin` → a plain symlink straight to
`packages/linkedin`). Confirmed with debug instrumentation: the mock
file's own top-level code never even runs from the app's perspective, and
`social-post.service.ts` calls the real `createLinkedinClient`. Bun's
`mock.module` doesn't bridge the two different resolution paths, even
though both ultimately point at the same file on disk.

Bisected with git worktrees + fully independent installs to confirm this
is not a false positive: the test passes cleanly at every commit through
`869f71d2` ("fix: missing deps in ducker build", the commit that first set
`injectWorkspacePackages: true`), and fails starting at the very next
commit (`7122d52`), whose only relevant change was regenerating
`pnpm-lock.yaml` with `pnpm install` (no `--frozen-lockfile`) — which is
what actually completed the `link:` → `file:` conversion for every
workspace dependency, `@repo/testing` included. `869f71d2`'s lockfile had
the _setting_ on but hadn't yet been regenerated to fully reflect it (most
`@repo/*` entries were still `link:`), which is why it didn't reproduce
there.

### Fix attempts that didn't work

- **`dependenciesMeta: { "@repo/ai": { "injected": true }, ... }`** listing
  every direct production dependency explicitly on `apps/api`, with the
  global `injectWorkspacePackages` setting removed: broke a _different_
  package (`@repo/logger` ended up as a dangling symlink to a virtual-store
  slot that was never created). Manually scoping injection per direct
  dependency doesn't reliably cascade through the transitive graph.
- **`dependenciesMeta: { "@repo/testing": { "injected": false } }`** on
  `apps/api`, with the global setting left on: doesn't work either. The
  lockfile still records `@repo/testing@file:packages/testing(...)` (not
  reverted to `link:`), and the test still fails the same way. The
  `injected` flag doesn't control the `link:`/`file:` lockfile
  representation that's actually the root cause — it's narrower than that.

### Fix that worked: re-register from apps/api's resolution context

Resolved 2026-08-07, on the test/mock side as suggested above, leaving
pnpm's injection mechanics alone:

- `packages/testing/src/mocks/linkedin-provider.mock.ts` now exports the
  replacement module object (`linkedinModuleMock`) instead of only
  building it inline inside its own `mock.module()` call.
- New `apps/api/test/preload.ts` (wired via `bunfig.toml`
  `[test].preload`) imports that object and calls
  `mock.module('@repo/linkedin', () => linkedinModuleMock)` again. Because
  the caller lives inside `apps/api`, Bun resolves `@repo/linkedin` to the
  same path the app's own code imports, so this registration is the one
  that actually intercepts `social-post.service.ts`. The frozen copy's own
  registration still covers its own path. Both registrations share one
  module object, so `LinkedinApiError` identity stays consistent
  everywhere.

Verified: the previously failing publish test and the full `apps/api`
suite (315 tests, 27 files) pass. The `ai` and `@repo/storage` mocks were
never broken because both resolution contexts happen to land on the same
virtual-store slot for them (confirmed by comparing the frozen
`@repo/testing` copy's `node_modules/@repo/*` symlink targets against
`apps/api/node_modules/@repo/*`). That is coincidence, not contract; if
either silently stops mocking after a lockfile change, re-register it in
the preload the same way.

### DX landmine: frozen `.pnpm` copies go stale — fixed via sync setting

The general staleness rule under injection: **an edit or rebuild reaches
consumers that resolve the package through a live symlink, and does not
reach consumers that resolve it through a materialized `.pnpm` slot.**
For apps/api as of 2026-08-07, `config`/`database`/`linkedin`/`logger`/
`queue`/`utils`/`workflow`/`export` were direct symlinks, while
`ai`/`auth`/`media`/`storage`/`testing` went through slots — but the
split is decided by peer-resolution divergence and shifts with lockfile
changes, so don't memorize it. Transitive resolutions are the sneaky
case: even a symlinked package reaches _its own_ dependencies through
slots (e.g. `@repo/database`'s view of `@repo/config`).

Observed concretely, twice:

- Adding an export to `packages/testing/src/` produced "Export named
  'linkedinModuleMock' not found" pointing into the frozen copy. Plain
  `pnpm install` (and even `--force`) reported "Already up to date"
  without refreshing it; deleting the `.pnpm` slot alone wasn't repaired
  either. Only a full re-link (delete `node_modules`, reinstall) fixed it.
- Rebuilding `@repo/storage` gave `packages/storage/dist/index.mjs` a new
  inode while the injected copy kept the old file. Nothing watches or
  syncs on build by default.

**Fix (2026-08-07)**: `pnpm-workspace.yaml` now sets

```yaml
syncInjectedDepsAfterScripts:
  - build
```

so pnpm re-syncs a package's injected copies whenever its `build` script
runs _through pnpm_ (`pnpm --filter @repo/<pkg> build`). Verified: after a
storage rebuild the slot's `dist/index.mjs` is hardlinked to the fresh
build output, and for `@repo/testing` (which got a no-op `"build": "true"`
script purely as a sync trigger, since it ships raw `src/`) a marker file
added to `src/` appeared in the injected copy after
`pnpm --filter @repo/testing build` and disappeared again after deleting
it and re-running the build.

So the pre-existing workflow — rebuild a package after editing it — is
sufficient again, including for `@repo/testing`. `pnpm clean` +
`pnpm install` remains the fallback if something still looks stale.

How this interacts with the dev workflows (all verified empirically):

- `pnpm --filter @repo/<pkg> build`: syncs.
- Turbo-run builds (`pnpm build`, `turbo run build --filter=...`, and the
  `^build` that `pnpm dev` runs on startup): sync. Turbo invokes the
  scripts in a way that still fires pnpm's hook.
- **Watch-mode rebuilds do NOT sync** (`pnpm dev:all`, where packages run
  `tsdown --watch`): the script never completes, so the
  after-scripts hook never fires. A `touch`-triggered rebuild left the
  source `dist/` on a new inode while the injected copy kept the old
  file. The usual `pnpm dev` is unaffected because it filters to the
  three apps and doesn't watch packages at all; after a package edit you
  run the filtered build anyway, and that syncs.
- **Turbo cache hits do NOT sync**: turbo restores `dist/` from its cache
  without running the script, so the hook never fires. On a fresh CI runner
  the injected copies are created at install time without `dist/` (it's
  gitignored), so a consumer rebuilt against cached packages fails to
  resolve them (2026-09-27: `@repo/web` could not resolve
  `@repo/auth/client`). CI therefore runs without a turbo cache. Locally
  this is masked because earlier real builds already synced the copies.
