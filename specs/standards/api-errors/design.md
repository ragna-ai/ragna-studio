# API errors standard: design

Design for [prd.md](./prd.md). Story IDs refer to that PRD.

## Wire format

```json
{
  "type": "https://docs.ragna.io/errors/out-of-credits",
  "title": "Out of credits",
  "status": 402,
  "detail": "Out of credits",
  "code": 402,
  "error": "Out of credits"
}
```

- Content type `application/problem+json` (RFC 9457). ofetch parses `+json` bodies as JSON.
- `Content-Language: en`. `title` and `detail` are never localized: the web owns all UI text, so
  `Accept-Language` is ignored.
- `type`: a URI from the shared enum, or `about:blank` (RFC 9457 section 4.2.1). With
  `about:blank`, `title` is the HTTP reason phrase.
- `title`: fixed English summary per type. `detail`: English text from the thrown exception, for
  logs and developers. The web never shows either.
- `status`: the HTTP status, repeated in the body.
- `instance` is not sent. Nothing needs it yet. A request or trace id extension follows with log
  correlation (#295).
- Extension members, only on their type:
  - `errors` on `validation` and `workflow-invalid`: a list of `{ rule, pointer?, detail? }`.
    `rule` is a machine identifier: a zod issue code (`too_small`, `invalid_format`, ...) for
    `validation`, a `WorkflowGraphIssueCode` for `workflow-invalid`. `pointer` is a JSON Pointer
    (RFC 6901) into the validated input, for example `#/name`.
  - `draft` on `email-draft-exists`: the existing draft, same shape as today's 409 body.
  - Values a translation needs (a zod `minimum`, a node id) get their own member on the entry
    when a client first needs them (US-2.5). The first is expected with per-field form display.
    No values are copied out of `detail` before that.
- Clients ignore extension members they don't know (RFC 9457 section 3.2), and the web treats an
  unknown `type` like `about:blank`. A new type therefore never breaks an older web build.
- `code` and `error`: the deprecated fields, unchanged values, for one release (US-6). `code`
  stays `ORGANIZATION_DELETED` for that type.
- 5xx bodies never carry `detail` from an unhandled error. A thrown
  `InternalServerErrorException` keeps its message in `detail`, like today's `error`.

## Problem types

| Slug                     | Status | Replaces                            | Web reaction             |
| ------------------------ | ------ | ----------------------------------- | ------------------------ |
| `validation`             | 422    | `z.prettifyError` prose             | "check your input" toast |
| `out-of-credits`         | 402    | `code: 402` checks                  | out-of-credits message   |
| `organization-deleted`   | 403    | `code: 'ORGANIZATION_DELETED'`      | restore page             |
| `linkedin-not-connected` | 400    | `errorCode: LINKEDIN_NOT_CONNECTED` | connect hint             |
| `workflow-invalid`       | 400    | `errors: string[]`                  | one message per rule     |
| `email-draft-exists`     | 409    | `{ draft }` body                    | opens the existing draft |

Adding a type: one enum entry and title in `@repo/api-errors`, one throw site in `apps/api`, one
`Record` entry and locale key in `apps/web`, one docs page, one API test. `check-types` fails in
the web until the mapping exists.

## `packages/api-errors` (new, client-safe)

Depends only on zod. Scaffolded with `pnpm gen package`, structured like its siblings.

- `problemTypeSchema`: `z.enum([...slugs])`, and `ProblemType`.
- `PROBLEM_TITLES: Record<ProblemType, string>`.
- `problemTypeUri(type)` and `problemTypeFromUri(uri)`: slug to and from
  `https://docs.ragna.io/errors/<slug>`. Unknown URIs return `null`.
- `problemDetailsSchema`: the body above, with `errors` and `draft` as optional extensions.
  The web parses responses with it. API tests assert with it.
- `PROBLEM_CONTENT_TYPE = 'application/problem+json'`.

## `apps/api`

- `exceptions/problem-details.ts`: `ProblemException extends HTTPException`, carrying an optional
  `type` and extensions, and `toProblemDetails(err)`.
- `exceptions/index.ts`: the existing classes stay and pass no type, so they produce
  `about:blank`. New `ValidationException`, `WorkflowInvalidException`,
  `EmailDraftExistsException`, `LinkedinNotConnectedException`. `OrganizationDeletedException`
  and the credit service's `PaymentRequiredException` get their type.
- `app.ts` `.onError` builds the body with `toProblemDetails(err)`, sets the
  content type and adds `code` and `error`. Unhandled errors become `about:blank` 500.
- `utils/validator-wrapper.ts` throws `ValidationException` with one entry per zod issue.
- The three controllers that return error JSON themselves (workflow publish and start, LinkedIn,
  email draft) throw instead.
- WebSocket error frames: payload becomes `{ type, status, title, code, message }`. `code` and
  `message` are the deprecated fields. `toErrorPayload` in `ws.controller.ts` reuses
  `toProblemDetails`.
- Chat stream `onError` returns the problem `type` URI (`about:blank` when nothing specific)
  instead of an i18n key.

## `apps/web`

- `lib/api-error.ts`:
  - `parseProblem(error)` reads `error.data` (HTTP) or the `ChatStreamError` payload (WS) and
    parses it with `problemDetailsSchema`. Returns `null` for anything else.
  - `PROBLEM_MESSAGE_KEYS: Record<ProblemType, MessageKey>`. `MessageKey` is the union of
    dotted key paths of `en-UK.json`, derived at type level from the JSON import.
  - `extractErrorMessage(error, fallback)`: the type's message when the type is known and the
    status is below 500. Otherwise `fallback`. Never `title`, `detail` or `error`.
  - `getProblemType(error)`: replaces `isOutOfCreditsError`, the `errorCode` check in
    `useSocialPostApi.ts` and the `code` check in `plugins/api.ts`.
  - Rule messages for `workflow-invalid` and `validation`: `Record<rule, MessageKey>` per type.
- `extractConflictingDraft` reads the `draft` extension of `email-draft-exists`.
- `WebSocketChatTransport.ts` keeps the whole payload on `ChatStreamError`. The chat view
  translates through `extractErrorMessage` instead of `$t(error.message)`.
- The call sites keep their signature `extractErrorMessage(error, t('...'))`. None need edits
  unless they read `data.error` themselves.

## Migration

1. Release 0.8.0 ships both formats (`code`, `error` and the problem fields). Release notes and
   the self-hosting upgrade page announce the removal.
2. Release 0.9.0 drops `code` and `error` from HTTP bodies and WS frames. A follow-up issue tracks
   it. The web reads only the new fields from day one, so an old browser tab against the new API
   is the only mixed case, and the deprecated fields cover it.

## Extension points

- Axis: problem type. Contract: `problemTypeSchema` plus `problemDetailsSchema`.
- Known variants: the six types above. Others are added only when a client must react differently.
- Fakes: web e2e tests stub API responses with bodies built from `problemDetailsSchema`. API
  tests need no fake, they assert on real responses.
- Packages considered: `http-problem-details` and similar npm packages. Not taken: the format is
  a few fields, and a zod schema is what both sides need anyway.
- Not abstracted: per-type HTTP status lives with the exception class, not in a registry. Only
  one throw site exists per type today.
