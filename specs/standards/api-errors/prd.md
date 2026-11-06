# API errors standard: RFC 9457 problem details (PRD)

> **Status: proposed** (2026-11-06). Issue #172. Fixes #293.

Every API error response becomes an RFC 9457 `application/problem+json` body with a stable
problem `type`. The web owns all text the user sees: it maps each type to its own i18n key and
never shows server prose. Today a German user sees English messages such as "Failed to create
chat", and API clients can only tell errors apart by parsing English text.

The design lives in [design.md](./design.md). The research behind it is in
[api-errors-research.md](../reference/api-errors-research.md).

## Problem

- `extractErrorMessage` (`apps/web/app/lib/api-error.ts`) shows the API's `error` text whenever
  there is one. The API almost always sends one, so about 90 call sites show English text in
  every locale (#293).
- The API has about 370 throw sites with 222 distinct English messages. 195 of them are 500s
  such as `InternalServerErrorException('Failed to create chat')`.
- Machine-readable identifiers exist, but each in its own field: `code: 'ORGANIZATION_DELETED'`
  (otherwise `code` is the HTTP status), `errorCode: LINKEDIN_NOT_CONNECTED`, and a 409 body of
  `{ draft }`. Validation failures return `z.prettifyError` prose, and workflow publish returns
  an `errors: string[]` list of English messages that the web joins and displays.
- The chat stream sends an i18n key (`chat.conversation.errors.generic`), so the API depends on
  the web's locale structure.

## Goals

- Users see every error message in their UI language.
- API clients identify an error by a documented, stable `type`, never by its text.
- One error format for HTTP responses, WebSocket error frames and chat stream errors.
- **Success signal:** the web reads no server prose (`title`, `detail`, `error`) for display.

## Non-goals

- Showing server-side field errors next to each form field. The web forms validate with their own
  schemas first. Per-field display of a server `422` is a follow-up issue.
- `/auth/*` responses. better-auth owns their shape.
- The `integration_error` redirect parameter. It is a browser redirect, not an API response.
- MCP tool errors and JSON-RPC transport errors. They are read by a model or an MCP client, and
  their protocols define their shape.
- A CI check for missing `de-DE` keys. That is #198.

## User stories

Roles: user (any signed-in user), API client developer (anyone calling the API from their own
code, for example on a self-hosted instance).

### US-1 Translated error messages (P1)

As a user, I want error messages in my UI language, so that I understand what went wrong.

- **US-1.1** Given the German UI, when creating a chat fails with a server error, then the toast
  shows the German "chat could not be created" text and no English server text.
- **US-1.2** Given the German UI, when a request fails with a problem type the web knows (out of
  credits), then the user sees that type's German message.
- **US-1.3** Given a client error with no specific type, when the web shows it, then the user
  sees the calling feature's own translated message.
- **US-1.4** Given a response that is not a problem body (a proxy error page, a network
  failure), when the web shows it, then the user sees the calling feature's translated message.

### US-2 One machine-readable error format (P1)

As an API client developer, I want every error in one documented format with a stable type, so
that my code can react to an error without parsing English text.

- **US-2.1** Given any request that fails, when the API responds with a `4xx` or `5xx`, then the
  body is `application/problem+json` with `type`, `title` and `status`, and the response says its
  language is English.
- **US-2.2** Given an unexpected server failure, when the API responds, then the status is `500`,
  the type is `about:blank`, and the body has no internal details.
- **US-2.3** Given a documented problem type, when its `type` URI is opened, then the docs page
  explains when the error happens and what the client can do.
- **US-2.4** Rule: a released problem type keeps its URI and meaning. Removing or renaming one is
  a breaking change.
- **US-2.5** Rule: every value a client needs (a limit, a field, a resource) travels in a
  structured member. `title` and `detail` are English only and never parsed.

### US-3 Invalid input names the field and the rule (P1)

As an API client developer, I want invalid input to name each broken field and rule, so that I
can fix the request without reading prose.

- **US-3.1** Given a request with an invalid field, when the API rejects it, then the status is
  `422`, the type is `validation`, and `errors` lists each issue with a pointer to the field and
  a rule identifier.
- **US-3.2** Given an invalid workflow, when a user publishes or starts it, then the status is
  `400`, the type is `workflow-invalid`, and `errors` lists one rule identifier per graph issue.
- **US-3.3** Given an invalid workflow in the German UI, when publishing fails, then the user sees
  a German message for each broken rule.
- **US-3.4** Given a rejected input in the web, when the API returns `validation`, then the user
  sees the translated "check your input" message.

### US-4 Special cases keep working (P1)

As a user, I want the flows that react to specific errors to keep working, so that the new
format changes nothing I rely on.

- **US-4.1** Given a user whose organization is scheduled for deletion, when any request is
  denied, then the type is `organization-deleted` and the web opens the restore page.
- **US-4.2** Given no LinkedIn account connected, when a user publishes a LinkedIn post, then the
  type is `linkedin-not-connected` and the web shows the connect hint.
- **US-4.3** Given an email thread with an active draft, when a user starts a new draft, then the
  type is `email-draft-exists`, the body carries the existing draft, and the web opens it.

### US-5 Chat errors use the same types (P1)

As a user, I want chat errors translated like every other error, so that chat doesn't fall back to
English or show raw keys.

- **US-5.1** Given a user with no credits, when they send a chat message over WebSocket, then the
  error frame carries the type `out-of-credits` and the user sees the translated message.
- **US-5.2** Given a chat answer that fails while streaming, when the error reaches the web, then
  the user sees the translated generic chat error.

### US-6 Migration window (P1)

As an API client developer, I want one release that sends both formats, so that I can update my
code before the old fields go.

- **US-6.1** Given the release that ships this standard, when the API returns an error, then the
  body also carries `code` and `error` with their old values.
- **US-6.2** Rule: `code` and `error` are removed in the next minor release. The release notes of
  both releases say so.

## Testing

| Criterion                        | Level                         | Folder                     |
| -------------------------------- | ----------------------------- | -------------------------- |
| US-1.1 to US-1.4, US-3.3, US-3.4 | e2e (Playwright, API stubbed) | `apps/web/e2e/`            |
| US-2.1, US-2.2, US-3.1, US-6.1   | API                           | `apps/api/test/errors/`    |
| US-2.3                           | docs build (link check)       | `apps/docs/`               |
| US-2.4, US-2.5                   | review rule, one enum         | `packages/api-errors/`     |
| US-3.2                           | API                           | `apps/api/test/workflow/`  |
| US-4.1, US-4.2, US-4.3           | API                           | `apps/api/test/<feature>/` |
| US-5.1, US-5.2                   | API (WS and stream)           | `apps/api/test/chat/`      |

## Enforcement

- An API test drives every exception class, the validator and an unhandled error through the app.
  Each body must parse with the shared problem schema and use the problem content type.
- The web maps types with a `Record<ProblemType, MessageKey>`. `MessageKey` is derived from
  `en-UK.json`, so a type without a mapping or a mapping to a missing key fails `check-types`.
- `de-DE` keys are checked by #198 once it lands.

## Standards checklist

- **Deletion:** n/a.
- **Retention:** n/a.
- **Erasure:** n/a. Problem bodies carry no personal data beyond what the request already held.
- **Docs:** new `apps/docs` section `errors/` with one page per problem type, plus the error
  format and migration note on the self-hosting upgrade page.

## Decisions

- **The web owns all UI text. The API sends a stable type.** Renaming a translation touches only
  the web, and API clients get a documented identifier. Lost: the API sending i18n keys (couples
  the API to the web's locale files) and status-only messages in the web (can't tell the special
  cases apart).
- **A type only where a client reacts differently.** All other errors are `about:blank` and the
  web shows the calling feature's message. 222 messages would make 222 contract entries. Lost:
  one type per exception.
- **The contract lives in a new client-safe package, `@repo/api-errors`.** It depends only on
  zod, so the web can import it without loading server code. Lost: a subpath of `@repo/logger`
  (server-only, a different concern) and a subpath of `@repo/api` (the web would depend on an app
  and its whole dependency tree).
