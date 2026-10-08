# Desktop App Strategy

**Question:** We want an AI agent that can access the user's local files. What's the right way to ship a desktop app, and should we keep Nuxt?

**Short answer:** Keep Nuxt as a static SPA renderer. Ship it inside **Electron**, built with **electron-vite + electron-builder** (the stack we already run in `ragna-desktop`). Load the SPA statically (no Nitro server in the shell) via a custom `app://` protocol.

> Updated 2026-07-09. Supersedes the earlier "maybe Electrobun, decide later" recommendation. The two decisions that unblock this are now made: (1) a dedicated **hono+bun API** owns the backend, and (2) local file access is a core feature, which favors Electron. See history at the bottom.

## Why local files force the shell decision

A server-side API **cannot reach the user's local filesystem** — the browser sandbox forbids it. Web-only options are limited to explicit uploads or the crippled File System Access API (Chromium-only, permission-gated, no background access).

If the agent needs to genuinely operate on local files (read, watch, edit in place, work offline), we need a **desktop shell with native filesystem access**. That's the whole reason this is an Electron decision and not a web feature.

## Why Electron over Tauri / Electrobun

We have a monorepo full of **Node/TypeScript** packages (`@repo/database`, `@repo/ai`, `@repo/queue`, `@repo/storage`, ...). Electron's main process runs Node, so those packages run **directly** in the shell — same language, same dependency graph.

- **Tauri** would push that logic into Rust or a bundled Node sidecar, eroding its small-binary advantage. `better-sqlite3` (our DB layer) is a native Node module that slots into Electron but not into Tauri's Rust backend.
- **Electrobun** is young, small ecosystem, moving API. Real risk for a shipped product.
- **Electron** is the heaviest binary (~85–120 MB) but the most battle-tested (VS Code, Slack, Discord) and the only one that reuses our Node packages as-is.

Decisive factor: **we already shipped this.** `ragna-desktop` (RAGNA Nano v0.5.0) is a working Electron + electron-vite app doing exactly this class of work — local file parsing (`pdf2json`, `officeparser`, `recursive-readdir`), local DB (sqlite3), local vector search (`@lancedb/lancedb`, `@xenova/transformers`), even local LLM (`node-llama-cpp`). This is a proven port, not a cold start.

## Tooling: electron-vite + electron-builder (not Forge)

These are different categories, which is the usual source of confusion:

- **electron-vite** = bundler/dev-server for the three processes (main / preload / renderer). Does **not** package.
- **electron-builder** = packaging + installers (what pairs with electron-vite).
- **Electron Forge** = all-in-one lifecycle (build + package + make + publish) via plugins; replaces electron-builder.

**Decision: stay on electron-vite + electron-builder.** Reasons:

1. We already have a working `electron-builder.yml` in `ragna-desktop` (notarize entitlements, win/mac/linux makers, native-module rebuild). Forge would mean re-expressing all of that for no capability gain.
2. Forge's headline value is its integrated renderer plugin + publishers. Our renderer is **owned by Nuxt** (below), so that value is neutralized. We'd only use Forge for main/preload/packaging, which electron-builder already handles.

Pick Forge only if we later want its built-in publishers (GitHub/S3 auto-update) badly enough to migrate.

## Renderer: Nuxt as a static SPA (no Nitro in the shell)

`apps/web` is `ssr: false`. `nuxi generate` produces static SPA assets. The Electron shell just loads them:

- **dev**: main loads `http://localhost:3004` (Nuxt dev server)
- **prod**: main loads the generated static output via a custom `app://` protocol

**Do NOT** follow the common tutorial pattern of running Nuxt in SSR mode inside Electron (spawning `node .output/server/index.mjs` + `loadURL('http://localhost')`). That drags in a Nitro server, child-process management, `tree-kill` cleanup, port races, and `extraResource` juggling — all self-inflicted. We're `ssr: false` with a dedicated hono+bun API, so we run **no Nitro** and skip all of it.

SPA history routing breaks under `file://` (deep links / reload 404). Fix with a **custom `app://` protocol** registered in main that serves the static bundle. Cleaner than `loadFile` + hash mode.

## Where the agent logic lives: thin shell, cloud does the heavy lifting

**Decision:** the desktop shell is a **thin file bridge**. All heavy lifting (agent logic, DB, embeddings, LLM) stays in the **cloud hono+bun API**. The Electron main process owns **only** what needs native access: reading, watching, and writing local files, then handing them to the cloud API over HTTP.

This means we deliberately avoid the `ragna-desktop` "fat local" pattern (local sqlite, local vector search, local LLM). Those native-heavy modules stay out of the shell.

Don't let core logic drift into the main process, or browser and desktop diverge. Treat `apps/web` as a pure SPA client talking to the standalone API over HTTP, not a full-stack Nuxt app that owns its backend.

### Note on the Electrobun trade-off

A thin bridge is the case where **Electrobun** would otherwise be attractive (Bun main aligns with our hono+bun API, ~12 MB binaries, built-in bytewise auto-updates, and the native-module risk mostly evaporates when little runs locally).

**We still choose Electron** for now, accepting the larger binary, to avoid Electrobun's maturity gotchas: it's 0.x with a small ecosystem and moving API, its Bun runtime still carries native-module uncertainty if the shell ever grows beyond a thin bridge, and it discards our proven `ragna-desktop` Electron reuse. Revisit Electrobun once it stabilizes, especially if binary size or the built-in updater become priorities.

## Gotchas to plan for

1. **Native modules** (`better-sqlite3`): must be rebuilt against Electron's ABI. `electron-builder install-app-deps` (postinstall) + `npmRebuild: true` handle it — already in our builder config. `@repo/database` can't be consumed without this rebuild.
2. **pnpm + Electron**: default symlinked store breaks native modules. Add `.npmrc` with `node-linker=hoisted` (or `--shamefully-hoist`).
3. **Security**: use `contextIsolation: true`, `nodeIntegration: false`, and expose file APIs through a **preload + `contextBridge`** (as `ragna-desktop` does via `@electron-toolkit/preload`). Never enable `nodeIntegration` (a common tutorial anti-pattern). Keep the Fuses hardening plugin.
4. **externalizeDepsPlugin**: native/Node deps must be externalized in main/preload so `.node` binaries resolve at runtime. Pure-JS `@repo/*` packages can be bundled in; native-touching ones (`@repo/database`) must be externalized.
5. **swc**: `ragna-desktop` needs `swcPlugin()` for typeorm decorators. `ragna-studio` uses Drizzle (no decorators), so we can likely drop swc — simpler config.

## Recommendation

- **Shell**: Electron (chosen over Electrobun for maturity; revisit later).
- **Tooling**: electron-vite + electron-builder (port from `ragna-desktop`).
- **Renderer**: Nuxt `ssr: false`, static build, loaded via `app://` protocol.
- **Layout**: add `apps/desktop` to the turborepo.
- **Boundary**: thin file bridge in main (read/watch/write local files); **all heavy lifting in the cloud hono+bun API** for browser/desktop parity.

Because the shell is a thin bridge, it likely consumes few `@repo/*` packages directly — mostly `@repo/config` and whatever HTTP client talks to the API. It does **not** need `@repo/database`/native modules unless we later move work local.

## History

- Original doc weighed Nuxt-vs-switching and leaned toward Electrobun with "pick the shell later." The framework question resolved (keep Nuxt) and the backend-extraction call (out of Nitro) both still hold.
- This revision resolves the remaining open questions: backend is hono+bun, shell is Electron, and the renderer is a static SPA loaded via `app://` (not SSR-in-Electron).
- Final call on the main-vs-cloud split: **heavy lifting stays in the cloud, the shell is a thin file bridge.** Electrobun was reconsidered (it fits a thin bridge well) but rejected for now on maturity grounds; keeping Electron/electron-vite avoids those gotchas.
