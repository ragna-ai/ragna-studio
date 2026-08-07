# @repo/testing

Shared test helpers: DB seeding/truncation fixtures and the external-provider
mocks (`ai`, `@repo/storage`, `@repo/linkedin`) registered via Bun's
`mock.module()`. Ships raw `src/` (no build step); consumers import the
TypeScript directly.

## Gotcha: run the build script after editing `src/`

Apps resolve this package through a **frozen copy** under
`node_modules/.pnpm/@repo+testing@...` (a consequence of
`injectWorkspacePackages: true`), not through a live symlink to this
directory. Nothing refreshes that copy on its own; plain `pnpm install`
(even `--force`) reports "Already up to date" and leaves it stale.

That's why this package has a no-op `"build": "true"` script: running it
through pnpm triggers `syncInjectedDepsAfterScripts` (pnpm-workspace.yaml),
which re-syncs the frozen copy. After editing `src/`, run:

```bash
pnpm --filter @repo/testing build
```

Symptoms of a stale copy: a change has no effect, or a new export fails
with `Export named 'X' not found in module ...node_modules/.pnpm/@repo+testing...`.
If the sync doesn't cut it, the fallback is `pnpm clean` + `pnpm install`.

Full background, including why the LinkedIn mock needs re-registration from
`apps/api/test/preload.ts`: `docs/docker-deploy/injected-workspace-packages.md`.
