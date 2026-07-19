# Web Browser Service (PRD)

> **Status: implemented** (`apps/webbrowser`, 2026-07-19). See
> "Implementation notes" at the end for what changed after the first pass.

A small internal HTTP service that fetches a URL with a real (stealth)
headless browser and returns cleaned markdown plus a handful of meta tags.
It exists so the agent's `web_browser` tool
(`packages/ai/src/tools/web-browser.tool.ts`) can let an agent "visit" a page
during a chat. Ported from `ragna-v2`'s `apps/scraper` (Express + tsup) into
this monorepo's conventions (Hono + Bun + tsdown).

## Goals (v1)

- Fetch a URL server-side and return cleaned markdown body + a small
  allow-listed set of meta tags (title, description, og:\*, keywords).
- Serve exactly one caller: the `web_browser` agent tool, over plain HTTP.
- Survive a single bad page (slow, hanging, erroring) without taking down
  scraping for every other in-flight or future request.
- Bound resource usage under concurrent agent calls — multiple chats or
  workflow runs can scrape at the same time.

## Non-goals (v1)

- **SSRF / internal-network protection.** Deliberately out of scope: the
  service is planned pure-internal-docker, not reachable from outside the
  trust boundary, and the caller (the agent tool) is the only thing that can
  reach it. Revisit if that assumption ever changes — e.g. the service
  becomes reachable from less-trusted input, or gets exposed beyond the
  docker network.
- Auth between callers and this service. Same trust-boundary reasoning.
- Rate limiting per caller.
- JS-heavy SPA support beyond what `networkidle2` + `domcontentloaded` give
  (no per-site wait-for-selector logic).
- Screenshot/PDF output — markdown + meta only.
- Caching scrape results.

## Architecture

- New app `apps/webbrowser` (`@repo/webbrowser`), following the
  `apps/api` / `apps/worker` house style: Hono app, `Bun.serve`, `tsdown`
  build, `@repo/config` / `@repo/logger`.
- Routes: `GET /health`, `GET /scrape?url=`.
- Scraping stack: `puppeteer-extra` with stealth, adblocker,
  block-resources (images/stylesheets/fonts dropped), and anonymize-ua
  plugins; `turndown` for HTML → Markdown.
- New config in `@repo/config`: `WEBBROWSER_PORT` (3011 — `API_PORT`
  already owns 3010), `WEBBROWSER_BASE_URL` (consumed by the agent tool
  instead of a hardcoded URL), `BROWSER_NAVIGATION_TIMEOUT`,
  `BROWSER_BODY_LOAD_TIMEOUT`, `BROWSER_MAX_CONCURRENCY`.
- `web-browser.tool.ts` now calls `${config.webBrowserBaseUrl}/scrape`
  instead of a hardcoded `localhost:3010`, which silently collided with the
  API app's own port and was never actually reachable.

## Request lifecycle

1. Validate `url` (zod): must be `https://`.
2. Acquire a concurrency slot (in-process semaphore, default 4 — see
   `BROWSER_MAX_CONCURRENCY`).
3. Get (or lazily launch) the shared Chromium instance; open a new tab.
4. Navigate with `waitUntil: ['domcontentloaded', 'networkidle2']`, then a
   bounded, non-fatal wait for `document.readyState === 'complete'`.
5. Extract allow-listed `<meta>` tags in a single browser-side pass.
6. Strip nav/header/footer/aside/script/iframe/fixed-position-overlay
   elements, then read `body.innerHTML`.
7. Convert to markdown, truncate to 10k characters, drop blank lines.
8. Close the tab (not the browser), release the concurrency slot.

## Reliability decisions

- **One shared browser process, not one per request.** A fresh
  `puppeteer.launch()` per request cost hundreds of ms and a whole Chromium
  process per scrape. The browser is now a lazily-launched singleton
  (auto-relaunched if it disconnects or crashes), reused across requests via
  `browser.newPage()` per call.
- **Concurrency cap via an in-process semaphore**
  (`apps/webbrowser/src/utils/semaphore.ts`), default 4. Bounds how many
  tabs/navigations run at once so a burst of agent calls can't exhaust the
  container.
- **Fire-and-forget puppeteer event listeners must not crash the process.**
  `request.continue()/abort()` in the request-interception handler and
  `dialog.accept()` return unawaited promises; a page/frame torn down
  mid-navigation can reject them. Because `index.ts` exits the process on
  any `unhandledRejection` (matching the `apps/api`/`apps/worker` pattern),
  these are explicitly `.catch(() => {})`'d so one bad page can't take down
  every other in-flight scrape.
- **`readyState` check is advisory, not fatal.** `domcontentloaded` +
  `networkidle2` don't guarantee `document.readyState === 'complete'` has
  already flipped by the time it's checked immediately afterward — the
  original hard failure on this produced intermittent false negatives on
  real sites. It's now a bounded `waitForFunction` that logs a warning and
  proceeds on timeout instead of aborting the scrape.
- **`Bun.serve` idle timeout disabled.** Bun kills a connection after ~10s
  of socket inactivity by default (same issue `apps/api` already works
  around for streaming responses). A scrape is a single non-streaming
  response, but a normal one routinely takes longer than 10s — navigation
  alone defaults to `BROWSER_NAVIGATION_TIMEOUT` (25s), before the body/
  readyState waits or any time queued behind the concurrency semaphore.
  Confirmed empirically: a slow handler got its connection reset around 12s
  without `idleTimeout: 0`, and completed normally with it set.

## Deployment

- `Dockerfile`: turbo-pruned build stage on Alpine (no Chrome needed to
  build). The runner stage uses `oven/bun:debian` — glibc, not Alpine/musl,
  since Chrome can't run on musl — with the distro `chromium` package
  installed via `apt-get`, pointed at via `PUPPETEER_EXECUTABLE_PATH`.
  `PUPPETEER_SKIP_DOWNLOAD=true` everywhere so puppeteer never tries to
  download its own Chrome-for-Testing build in the container.
- Runtime is Bun (`Bun.serve`), matching `apps/api` / `apps/worker` — not
  Node, despite puppeteer traditionally running under Node. Bun's
  `node:http` / child-process compatibility is sufficient here.
- `pnpm-workspace.yaml`: `puppeteer: true` added to `allowBuilds` so its
  postinstall (Chrome-for-Testing download, used for local dev) is allowed
  to run.
- Wired into the root `dev` script (`--filter=@repo/webbrowser`) alongside
  web/api/worker.

## Known limitations / later

- No SSRF protection (see Non-goals) — revisit before this service, or its
  caller, is exposed beyond the internal docker network.
- No caching: identical URLs are re-scraped on every call.
- No retry policy for transient navigation failures. The tool-level caller
  has a 30s abort and swallows failures into a "cannot visit website"
  message; the service itself does not retry.
- `GET /health` only checks that the HTTP server is up, not that Chrome is
  actually launchable.

## Implementation notes (as shipped)

- Ported from `ragna-v2`'s `apps/scraper`; element-stripping rules,
  allow-listed meta tags, and the 10k-character markdown truncation are
  preserved behavior, rewritten without the dead code paths and `any` types
  the original had.
- Verified end to end during development: shared-browser reuse confirmed
  via process inspection (one Chromium process across many requests),
  the concurrency cap confirmed under a 6-request burst against the default
  limit of 4 (4 ran immediately, 2 queued and ran after slots freed), and a
  hard navigation failure (`ERR_NAME_NOT_RESOLVED`) returned a clean 500
  without affecting subsequent requests.
