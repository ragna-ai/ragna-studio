---
name: integration-connector
description: Apply when building or changing a connector to an external vendor account (cloud drives, mailboxes, calendars, social posting). Separates auth from capability, puts connection handling in one shared place, and covers multi-tenant SaaS concerns (tenant scope, token refresh, rate limits, sync cursors) and how connectors are tested. Load together with system-design.
---

A connector lets a user link an external account (Google, Microsoft, ...) and lets the product use one capability of it (mail, files, calendar). Adding the next vendor for an existing capability should mean: one catalog entry, one vendor implementation, one registry entry, its test fixtures. Nothing else changes.

**Context for newcomers.** The product is a multi-tenant SaaS: users belong to workspaces, and every connection belongs to one user in one workspace. Shared integration code (OAuth, the catalog, token storage and refresh) lives in `packages/integrations`. Capability code (for example mail) lives in its own package. The API (`apps/api`) and background worker (`apps/worker`) consume both. Read the system-design skill first: contracts, typed registries and options-object factories are assumed here.

## Two axes, one shared glue layer

Keep authentication and capability apart. They vary independently: one Microsoft login can serve both mail and files.

- **Auth axis**, one implementation per auth provider (`google`, `microsoft`). Builds the authorize URL, exchanges and refreshes tokens, reads the account profile. Knows nothing about mail or files.
- **Capability axis**, one contract per category (mail, files, calendar), with one implementation per vendor. An implementation receives a function that returns a valid access token. It knows nothing about OAuth.
- **Catalog**, a list of integrations as data. Each entry has an integration id, its auth provider, its category and the scopes it needs. The integration id is the single key that joins the two axes. Don't invent a second id list per capability with lookup tables back to the catalog.
- **Shared glue, written once**, category-agnostic: load the connection, check it belongs to the expected provider, check its granted scopes cover the integration, get a valid token, and turn "needs re-authorization" into a clear reconnect error. Each capability only registers its factories, keyed by integration id.

## Folder layout per capability

```
<package>/src/<capability>/
  <capability>.types.ts  # the contract: interface + shared types and zod schemas
  index.ts               # registry + public exports
  errors.ts              # one vendor-neutral error type
  <vendor>/
    <vendor>.provider.ts # implements the contract; the only file that knows this vendor
    <vendor>.client.ts   # HTTP calls to the vendor API, built on the shared client
    <vendor>.parse.ts    # vendor payload -> contract types, validated with zod
    <vendor>.types.ts    # vendor wire types, never exported from the package
```

- **Vendor-neutral contract.** No vendor names in contract types or fields.
- **Opaque ids.** Ids from the vendor are plain strings that callers store and pass back, never parse.
- **One vendor API, one client.** If a vendor serves several capabilities through one API (Microsoft Graph serves mail and drive), its client lives in a shared place, not inside one capability.

## SaaS concerns

Handle these once, in the shared glue or the shared client, never separately in each vendor implementation:

- **Tenant scope on every call.** Build a provider instance per connection, per request or job. Never share one across users or workspaces. A vendor id is only valid together with the connection it came from.
- **Token refresh in one place only.** Refresh must run under a lock shared by every process (API and worker), and re-read the stored token inside the lock. Many vendors rotate refresh tokens, so two parallel refreshes can revoke the connection. The integrations package already provides this. Vendor code only ever calls the token getter it was given.
- **Rate limits per connection.** Back off on HTTP 429 and 5xx per connection, honouring the `Retry-After` header. Not per item, not globally.
- **Pagination and sync cursors are normalised in the contract.** Use one `cursor` / `nextCursor` shape, whatever the vendor uses underneath (page tokens, delta links).
  - Hold the cursor on transient failures (network, rate limit, auth) so the work is retried.
  - Advance it past an item that fails permanently, so one bad item can't block the sync forever.
  - On an expired cursor, take a fresh cursor first, then run a full resync.
- **Vendor-neutral errors.** Callers see a small set: auth rejected, not found, rate limited, cursor expired. Never a vendor status body.
- **Secrets stay in the client.** No tokens in logs, error messages or background job payloads.

## Testing

Connectors are tested through the API or the worker, like everything else (see tdd). The real vendor implementation must run in those tests.

- **Fake the vendor's HTTP, not our package.** Use a fetch fake that answers by vendor host and path. Then the provider, parsing and client code all run. Look in `packages/testing` for the existing HTTP fakes and extend them, don't start a parallel one.
- **Fail on unmatched requests.** The fake throws on any vendor URL it has no handler for. A forgotten fixture must fail loudly and never reach the real API.
- **Base handlers per vendor, overrides per test.** Happy-path responses by default. A test overrides one route for 401, 404, 429 or 5xx. Overrides are reset after every test.
- **One contract suite per capability, as an exported function**, for example `runDriveContract({ vendor, seedConnection, fixtures })`. It holds the shared scenarios: list, fetch, not found, token rejected, rate limited, cursor expired. Each vendor's test file calls it, then adds vendor-only cases next to it. A new vendor gets the shared scenarios for free.
- **Realistic fixtures.** Vendor payloads are trimmed copies of real responses, with ids and personal data replaced. Not hand-invented shapes.

## Before finishing

- Does adding the next vendor touch only the catalog, one new vendor folder, the registry and its fixtures?
- Is connection, token and scope handling reused from the shared glue, not repeated?
- Do the tests run the real vendor implementation against faked HTTP, with the contract suite?
- Are tokens absent from every log line, error and job payload?
