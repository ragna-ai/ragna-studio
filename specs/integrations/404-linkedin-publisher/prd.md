# Integrations: LinkedIn publishing on the shared connection layer (PRD)

> **Status: implemented** (2026-11-15, PR #407). Issue #404. Extends #224, depends on #403.

Publishing a social post talks to LinkedIn through its own client, outside the integration
connection layer. It ignores whether LinkedIn posting is turned on for the connection, has no
retry or rate-limit handling, and its tests replace the client entirely. This PRD moves LinkedIn
publishing onto the shared connection layer and its shared HTTP client. Users get the same
connection rules and the same safe retries as mail and cloud drive. Design: [design.md](./design.md).

## Problem

- Publishing loads the connection by provider and fetches a token. It never checks that the
  connection has LinkedIn posting turned on, or that it holds the posting permission.
- LinkedIn answering 401 ends in a generic server error and a **Failed** post, while the connection
  still reads as connected.
- No retry on 429 or 5xx. One busy moment at LinkedIn fails the whole publish.
- The LinkedIn client has no test coverage: API tests mock the whole package.
- LinkedIn upload steps (register, upload, wait) run inside `apps/api`, not in the vendor code.

## Goals

- Publishing follows the same connection rules as every other integration.
- A busy LinkedIn is retried, and a post never goes out twice.
- **Success signal:** the LinkedIn client and its parsing run in every social post API test.

## Non-goals

- A vendor-neutral social contract or registry. LinkedIn is the only social provider; the second
  one shapes the seam.
- Parallel publish requests on one draft (#405).
- Retry rules of the shared client itself (#403).
- UI changes. The existing **linkedin-not-connected** handling stays as it is.

## User stories

Roles: user (any signed-in user with a LinkedIn connection).

### US-1 Publishing respects the connection (P1)

As a user, I want publishing to follow my LinkedIn connection's settings, so that RAGNA Studio
never posts with a permission I turned off.

- **US-1.1** Given a LinkedIn connection with LinkedIn posting turned off, when the user publishes a
  draft, then the API answers `linkedin-not-connected` and LinkedIn receives no request.
- **US-1.2** Given a LinkedIn connection without the posting permission, when the user publishes a
  draft, then the API answers `linkedin-not-connected` and LinkedIn receives no request.
- **US-1.3** Given LinkedIn rejects the stored access, when the user publishes a draft, then the API
  answers `linkedin-not-connected` and the post keeps its previous status.
- **US-1.4** Given LinkedIn rejects the stored access, when the user publishes a draft, then the
  connection reads **Needs reconnect** and the user gets a reconnect notification.

### US-2 Busy LinkedIn is retried safely (P1)

As a user, I want a short LinkedIn outage to be retried without double posts, so that each draft
goes out exactly once.

- **US-2.1** Given LinkedIn answers "too many requests" with a wait time once, when the user
  publishes a draft, then the post is published.
- **US-2.2** Given LinkedIn answers a server error when the post is created, when the user publishes
  a draft, then LinkedIn received one create request and the post is **Failed**.
- **US-2.3** Given LinkedIn answers a server error once while an image is registered, when the user
  publishes a draft with that image, then the post is published.

### US-3 Image processing failures are reported (P2)

As a user, I want to know when LinkedIn could not process an image, so that I can replace it and
publish again.

- **US-3.1** Given LinkedIn reports an image as failed, when the user publishes a draft with that
  image, then the post is **Failed** and LinkedIn received no create request.
- **US-3.2** Given LinkedIn never finishes processing an image, when the user publishes, then the
  post is **Failed** after the wait limit.

## Testing

| Criterion        | Level | Folder                       |
| ---------------- | ----- | ---------------------------- |
| US-1.1 to US-1.4 | API   | `apps/api/test/social-post/` |
| US-2.1 to US-2.3 | API   | `apps/api/test/social-post/` |
| US-3.1, US-3.2   | API   | `apps/api/test/social-post/` |

Every existing social post test keeps passing on the faked LinkedIn HTTP, including the text,
single-image and multi-image request bodies.

## Standards checklist

- **Deletion:** n/a, no new data.
- **Retention:** n/a.
- **Erasure:** n/a, no new personal data.
- **Docs:** the `linkedin-not-connected` error page (new causes: posting turned off, access
  rejected) and the **Failed** row on the social posts page.

## Decisions

**No social contract yet.** The publisher is LinkedIn-named, with no registry. A neutral interface
with one implementation would only guess where a second network differs. Its parameter types are
already vendor-neutral, so extracting the contract later is mechanical. Lost: the full
capability layout that mail and cloud drive use.
