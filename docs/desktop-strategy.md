# Desktop App Strategy: Nuxt vs. Switching

**Question:** We plan a desktop app in the future with Electrobun. The webapp is currently planned as Nuxt. Should we switch strategy or keep Nuxt?

**Short answer:** Keep Nuxt. Don't switch frameworks. But change how we think about the boundary between frontend and backend now, so the desktop target is painless later.

## Why Nuxt is already fine for Electrobun

`apps/web` is `ssr: false`, so it builds to static SPA assets. Electrobun (like Tauri) just loads web assets into a system webview. A static SPA bundle drops straight in. There's no fundamental incompatibility, and switching to React/Solid/vanilla would buy us nothing here.

## The real issue isn't Nuxt, it's the Nitro server

Our coupling risk is the Nuxt server layer (Nitro). Right now `server/api/auth/[...all].ts` and better-auth run inside the Nuxt server. In a browser deployment that server exists. In an Electrobun desktop build, it does not. The webview is just a client.

So the strategic decision is: **treat `apps/web` as a pure SPA client that talks to a standalone API over HTTP**, not as a full-stack Nuxt app that owns its backend.

If we do that:

- Browser build: SPA + hosted API.
- Desktop build: same SPA bundle in Electrobun + same hosted API.
- One frontend codebase, two shipping targets.

If we instead lean hard on Nitro server routes for core logic, we'll have to re-host or re-implement that backend for desktop later. That's the expensive path.

We already have the right bones for this: a monorepo with shared packages. Pull auth and business endpoints into a dedicated API app (or extend the `apps/worker` thinking into an HTTP service) rather than Nitro. Keep Nitro only for dev convenience and BFF proxying.

## Electrobun-specific caveats

These are about Electrobun the product, not Nuxt:

1. **Maturity.** It's young, small ecosystem, fewer production references, and the API still moves. For a product we ship to customers, that's real risk. Tauri is the more proven "system-webview + small binary" option. Electron is the heaviest but most battle-tested.
2. **System webview = WebKit-flavored rendering.** We lose bundled-Chromium consistency. Tailwind v4 and shadcn-vue are fine in WebKit, but we must actually test in Safari/WebKit, not just Chrome.
3. **Bun in the main process.** Nice for native and IPC code, but don't let core business logic drift into the Electrobun main process. Keep it in the shared API so the browser app keeps parity.

## Recommendation

Keep Nuxt SPA. Make one architectural move now: **extract the backend out of Nitro into a standalone API** that both browser and desktop consume. That decision is framework-agnostic and pays off regardless of whether the desktop shell ends up being Electrobun, Tauri, or Electron. Pick the actual desktop shell later (closer to when we build it), since Electrobun's maturity will look very different by then.
