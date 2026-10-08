## TypeScript 7 upgrade: blocked, revisit later

### Decision

Not upgrading yet. Attempted bumping the `typescript` catalog entry from `6.0.3` to `7.0.2` on 2026-07-09 and it breaks the build immediately. Reverted.

### What TypeScript 7 is

A native port of the compiler written in Go (the "tsgo"/Corsa rewrite), shipped as `typescript@7.0.2` with per-platform native binaries (`@typescript/typescript-<platform>`). Same type-checking behavior as TS 6, but 8-12x faster compiles and much faster editor startup. Announced at https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/.

### Why it's blocked here

`tsdown` (used by every `@repo/*` package for builds) generates `.d.ts` files via `rolldown-plugin-dts`, which drives the TypeScript compiler through its programmatic API. **TS 7.0 ships without a stable programmatic API** (Microsoft says it lands in 7.1). Bumping the catalog version and running `pnpm build` fails on the very first package:

```
[plugin rolldown-plugin-dts:generate]
TypeError: Cannot read properties of undefined (reading 'useCaseSensitiveFileNames')
    at rolldown-plugin-dts/dist/tsc-CgJ-ct_1.mjs
```

Every package in `packages/*` builds this way, so this isn't a one-off: it blocks the whole monorepo build.

Second, independent blocker: **Vue Language Tools (Volar) doesn't yet support TS 7's language server**, per the same announcement. Even if builds worked, `.vue` file IntelliSense in `apps/web` would degrade until Vue tooling catches up. (`apps/web` doesn't run `tsc`/`vue-tsc` in CI today — there's no `check-types` script for it, so this would only hit local editor experience, not the build.)

### What's already fine

`packages/ts-config/base.json` is already written in a TS7-compatible style: explicit `types: ["node"]`, `moduleResolution: "bundler"`, no `baseUrl`, no legacy `module`/`target` values. No prep work needed on our config when the upstream tools catch up.

### Revisit when

- `rolldown-plugin-dts` / `tsdown` ship support for TS 7's compiler API (or TS 7.1 stabilizes the programmatic API), **and**
- Vue Language Tools supports TS 7's language server (matters for editor experience, not the build).

Check both before retrying. The repeat test is cheap: bump `typescript` in `pnpm-workspace.yaml` catalog, `pnpm install`, `pnpm build`.
