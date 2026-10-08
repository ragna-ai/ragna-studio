## Backend extraction: from Nitro to a standalone Hono API

### Decision

We are extracting the backend into a standalone **`apps/api`** service (Hono on Bun). Nitro stops being our API host.

The driver is no longer just desktop. We have three consumers for one backend:

1. **Nuxt SPA** (`apps/web`, `ssr: false`) — the studio app, browser users.
2. **Electrobun desktop** — same SPA bundle in a webview, `file://` / custom-protocol origin.
3. **Website chatbot widget** — an embeddable chatbot dropped onto external customer sites, authenticated per-site with **JWT**.

Consumer 3 is the reason this is now a "do it" and not a "maybe later". A public, embeddable endpoint cannot be served from inside the Nuxt Nitro layer without turning Nuxt into a load-bearing backend for untrusted third-party origins. We want one API that all three talk to, with auth transport chosen per consumer.

### What Nitro does today

Only two server routes exist, and both are thin wrappers over `@repo/*` packages:

- `server/api/auth/[...all].ts` — delegates the whole auth surface to `@repo/auth/server` (`auth.handler`). Needs DB access. Real backend.
- `server/api/test-email.post.ts` — calls `@repo/mail`. Also real backend (needs SMTP, runs server-side).

Nitro is effectively acting as our API host already. Neither route is Nuxt-specific, so this is close to a lift-and-shift.

### The coupling that has to change

`app/composables/useAuth.ts` hardcodes the auth client `baseURL` to the current origin:

```ts
const url = useRequestURL();
return createAuthClient({ baseURL: url.origin, ... });
```

In a browser this resolves to Nitro, so `/api/auth/*` works. In Electrobun the webview origin is `file://` or a custom protocol: there is no Nitro there, `url.origin` points at nothing, auth breaks. The chatbot widget has the same problem from the other side: it runs on a customer's origin, not ours.

The fix is the same for all three: the client talks to an **absolute, configurable API base URL**, never its own origin.

## Target architecture

### Where the API sits

A new long-running server app alongside the others. Bun runtime fits the Electrobun/Turso direction; Hono is runtime-agnostic anyway.

```
apps/
  web/        Nuxt SPA (ssr: false)  -> static assets, no backend
  worker/     BullMQ consumer + crons (unchanged)
  api/        Hono HTTP server  <- NEW, owns all backend routes
packages/
  @repo/auth, @repo/database, @repo/mail, @repo/ai,
  @repo/queue, @repo/config, @repo/logger ...  (unchanged, shared by api + worker)
```

Key idea: `apps/api` consumes the exact same `@repo/*` packages the Nitro routes already call. The packages do not change. We only move the HTTP entry point.

### Inside `apps/api`

```
src/
  index.ts          // Bun.serve({ fetch: app.fetch }) — entry point
  app.ts            // creates the Hono app, mounts middleware + routes
  middleware/       // cors, auth-session, jwt-verify, error handler, logger, rate-limit
  routes/
    auth.ts         // mounts better-auth handler (cookie + bearer + jwt)
    chat.ts         // chatbot endpoints, JWT-guarded, org-scoped
    mail.ts         // ports server/api/test-email
    <feature>.ts    // future business endpoints
```

### Request topology

```
Browser:   [Nuxt SPA static]     --HTTP(cookie)-->  [Hono API]  -->  Turso / Redis / SMTP / AI
Desktop:   [Electrobun + SPA]     --HTTP(bearer)-->  [Hono API]  -->  (same)
Chatbot:   [3rd-party website]    --HTTP(JWT)----->  [Hono API]  -->  (same)
                                                          |
                                              enqueue ----+
                                                          v
                                                   [Worker: BullMQ]
```

One API, three auth transports (details below). The API stays thin: heavy work goes to the worker via `@repo/queue`; that boundary is unchanged.

## Auth: one backend, three transports

better-auth is one instance in `@repo/auth`. We enable three plugins and pick the transport per consumer.

| Consumer        | Transport      | Mechanism                       | Why                                                                                                  |
| --------------- | -------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Browser SPA     | Cookie session | better-auth default             | Same convenience we have today, now cross-origin via CORS + credentials.                             |
| Desktop webview | Bearer token   | better-auth `bearer` plugin     | Cookies on `file://`/custom protocols are fragile. Store the token, send `Authorization: Bearer`.    |
| Website chatbot | JWT            | better-auth `jwt` plugin (JWKS) | Public, third-party origin. Short-lived, verifiable without a DB round-trip, scoped to one org/site. |

### The chatbot / JWT flow

The chatbot widget is embedded on customer sites, so it must never carry a long-lived user session. Shape it as a scoped, short-lived token:

1. Each customer site has a **public widget key** (identifies the org/tenant, safe to ship in page HTML, rate-limited).
2. The customer's page (or a tiny token endpoint) exchanges that key for a **short-lived JWT** scoped to the org, issued by our API via better-auth's `jwt` plugin.
3. The widget calls `/chat/*` with `Authorization: Bearer <jwt>`. The API's `jwt-verify` middleware validates against the local JWKS (`/api/auth/jwks`), reads the org claim, and scopes the request. No DB hit to authenticate.
4. Every chatbot route is org-scoped and rate-limited by that claim. Untrusted origins never reach user-session routes.

Decide the **claim shape early** (`org_id`, `scope`, `exp`) because it shapes `@repo/auth` config and every downstream authorization check. This is the one design choice to lock before writing routes.

### Auth mounts cleaner than in Nitro

better-auth's handler is already web-standard, and so is Hono, so it plugs in with no adapter:

```ts
// Nitro today: needs toWebRequest()
auth.handler(toWebRequest(event));

// Hono: raw Request goes straight in
app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw));
```

### CORS becomes explicit

Today everything is same-origin, so CORS is a non-issue. Once SPA, desktop, and chatbot are separate origins, the API owns CORS:

- Web origin + desktop origin: `credentials: true` (cookie + bearer).
- Chatbot: the widget runs on **arbitrary customer origins**, so `/chat/*` needs its own CORS policy. Because it uses JWT (not cookies), we do not send credentials there, which lets us relax the origin list per registered site instead of a single allow-list.

Keep the two CORS regimes separate. Do not let the permissive chatbot policy leak onto the user-session routes.

## The architectural payoff: typed client

The real reason to pick Hono over a standalone Nitro is end-to-end type safety. Hono's RPC gives a typed client (`hc<AppType>`). Export the API's route type from a shared package and the frontends get compile-time-checked calls with autocomplete, no codegen step.

```
apps/api  ->  exports AppType  ->  @repo/api-client  ->  consumed by apps/web, desktop, widget
```

One contract, multiple frontends consume it identically.

Validation stays Zod. We already use Zod in the web app. `@hono/zod-validator` reuses the same schemas, ideally hoisted into a shared `@repo/contracts` package so frontend and backend validate against one source.

## What changes in `apps/web`

Almost nothing:

1. `useAuth()` `baseURL` becomes config-driven (`apiBaseUrl`) instead of `url.origin`.
2. Delete `server/api/*`. Optionally keep Nitro purely as a dev proxy for same-origin cookie convenience, or run the SPA directly against the API. Either way Nitro is no longer load-bearing.

## Notes on framework choice

- **Performance is a wash.** Nitro is fast, but not meaningfully faster than Hono. Hono on Bun is one of the fastest JS server stacks there is. For our workload (auth, email, chat, AI calls) the DB, network, and model calls dominate. Framework is not the bottleneck. We are switching for architecture (separation, typed RPC, a public endpoint), not speed.
- **We never bolt Hono into Nuxt.** That is awkward and non-idiomatic. Our auth handler is already a web-standard `fetch(Request) -> Response`, so it ports to any runtime cleanly.

## Honest trade-offs

Versus keeping Nitro: we gain clean separation, the typed RPC client, and a safe home for the public chatbot endpoint. We take on:

- **CORS complexity**, now with two regimes (trusted user origins vs. arbitrary chatbot origins).
- **A second deployable** to run and monitor.
- **JWT/JWKS lifecycle**: key rotation, token TTLs, per-site widget-key management and rate limiting.

Given the chatbot requirement, these are costs we are choosing to pay, not risks to defer.

## Sequencing

1. Make `useAuth()` `baseURL` config-driven. Safe, no-regret, unblocks everything. (Do first.)
2. Stand up `apps/api` with the auth handler + `test-email` ported over. Point the SPA at it. Prove parity with today.
3. Add the `jwt` + `bearer` plugins to `@repo/auth`; lock the JWT claim shape.
4. Build `/chat/*` routes with JWT verification, org scoping, rate limiting, and the arbitrary-origin CORS policy.
5. Extract `@repo/contracts` (shared Zod) and `@repo/api-client` (typed `hc<AppType>`).
6. Desktop bearer transport when Electrobun is real.
