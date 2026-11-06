# API errors standard: slices

Build plan for [prd.md](./prd.md) and [design.md](./design.md), for parallel agents. Every slice
follows AGENTS.md and loads the clean-code skill, plus tdd for `apps/api`. Story IDs refer to the
PRD.

## Order

```text
S1 contract ──┬── S2 API HTTP
              ├── S3 API WS + stream
              ├── S4 web
              └── S5 docs
```

S1 runs alone and lands first. S2 to S5 then run in parallel. Each touches only its owned paths.
A file not listed under a slice is off limits for it. A slice that needs a change outside its
paths reports it instead of making it.

## Shared rules

- Only S1 edits `package.json` files and `pnpm-lock.yaml`. Other slices add no dependencies.
- Tests go in new files named in the slice, never in existing test files of another slice.
- API test runs serialize through the Postgres advisory lock, so parallel `pnpm test:api` runs
  are safe. No `db:push`, no docker commands.
- The contract is fixed once S1 lands: the `@repo/api-errors` exports, `ProblemException`,
  `toProblemDetails` and the WS payload shape in design.md. A slice that needs a contract change
  reports it to the teamlead.

## S1 contract

- **Owns:** `packages/api-errors/` (new, via `pnpm gen package --args api-errors "..."`),
  `apps/api/src/exceptions/problem-details.ts` (new), the `onError` handler in
  `apps/api/src/app.ts`, the `package.json` of `apps/api` and `apps/web`, `pnpm-lock.yaml`,
  `apps/api/test/errors/problem-details.test.ts` (new).
- **Builds:**
  - In the package: `problemTypeSchema`, `ProblemType`, `PROBLEM_TITLES`, `problemTypeUri`,
    `problemTypeFromUri`, `problemDetailsSchema`, `PROBLEM_CONTENT_TYPE`, and the rule enums for
    `validation` (zod issue codes) and `workflow-invalid` (`WorkflowGraphIssueCode` values).
  - In the API: `ProblemException`, `toProblemDetails(err)`, and `onError` using it with
    `Content-Language: en` and the deprecated `code` and `error` fields.
- **Rules:** the package depends only on zod. A type-level check in `problem-details.ts` fails
  `check-types` when `WorkflowGraphIssueCode` gains a code the rule enum lacks.
- **Delivers:** US-2.1, US-2.2, US-2.4, US-2.5, US-6.1.
- **Done when:** `pnpm --filter @repo/api-errors build`, `pnpm test:api` and
  `pnpm check-types` pass.

## S2 API HTTP errors

- **Owns:** `apps/api/src/exceptions/index.ts`, `apps/api/src/utils/validator-wrapper.ts`, the
  error paths of `workflow.controller.ts`, `social-post.controller.ts` and `email.controller.ts`,
  the type of `OrganizationDeletedException` and of the credit service's
  `PaymentRequiredException`. New test files: `apps/api/test/errors/exceptions.test.ts`,
  `apps/api/test/errors/validation.test.ts`, `apps/api/test/workflow/workflow-errors.test.ts`,
  `apps/api/test/social-post/social-post-errors.test.ts`,
  `apps/api/test/email/email-draft-errors.test.ts`,
  `apps/api/test/organization/organization-deleted-errors.test.ts`.
- **Builds:** `ValidationException`, `WorkflowInvalidException`, `EmailDraftExistsException`,
  `LinkedinNotConnectedException` on top of `ProblemException`. The validator throws
  `ValidationException`. The three controllers throw instead of returning error JSON.
- **Delivers:** US-3.1, US-3.2, US-4.1, US-4.2, US-4.3 (API side), and the enforcement test that
  drives every exception class, the validator and an unhandled error through the app.
- **Runs:** `pnpm test:api`.

## S3 API WebSocket and stream errors

- **Owns:** `apps/api/src/ws/protocol.ts`, `apps/api/src/controllers/ws.controller.ts`, the error
  frames in `apps/api/src/services/channel.service.ts`, the stream `onError` in
  `apps/api/src/services/chat.service.ts`. New test file: `apps/api/test/chat/chat-errors.test.ts`.
- **Builds:** WS error payload `{ type, status, title, code, message }` from `toProblemDetails`.
  The stream `onError` returns a type URI instead of an i18n key.
- **Delivers:** US-5.1, US-5.2 (API side).
- **Runs:** `pnpm test:api`.

## S4 web

- **Owns:** `apps/web/app/lib/api-error.ts`, `apps/web/app/plugins/api.ts`,
  `apps/web/app/features/social/composables/useSocialPostApi.ts`,
  `apps/web/app/features/email/composables/useEmailDraftApi.ts`,
  `apps/web/app/features/chat/lib/WebSocketChatTransport.ts`, the chat view that renders the
  stream error, the workflow publish error display, `apps/web/i18n/locales/*.json`. New test
  file: `apps/web/e2e/api-errors.spec.ts`.
- **Builds:** `parseProblem`, `getProblemType`, `MessageKey`, `PROBLEM_MESSAGE_KEYS`, the rule
  message records, the new locale keys in `en-UK` and `de-DE`. `isOutOfCreditsError` and every
  read of `data.error`, `data.code` and `data.errorCode` go.
- **Contract:** builds against `problemDetailsSchema` and the WS payload shape only. It never
  waits for S2 or S3: the e2e tests stub API responses with Playwright routes.
- **Delivers:** US-1.1 to US-1.4, US-3.3, US-3.4, and the web side of US-4.1 to US-4.3, US-5.1
  and US-5.2.
- **Runs:** `pnpm test:e2e`, `pnpm check-types`, `pnpm check:web-type-graph`.

## S5 docs

- **Owns:** `apps/docs/src/content/docs/errors/` (new), the sidebar entry in
  `apps/docs/astro.config.ts`, `apps/docs/src/content/docs/self-hosting/upgrades-and-backups.mdx`.
- **Builds:** an index page with the error format, and one page per problem type at
  `/errors/<slug>/`, so each `type` URI opens its page. The upgrade page announces the removal of
  `code` and `error`. Loads the docs-writing skill.
- **Delivers:** US-2.3, US-6.2 (docs part).
- **Runs:** the docs build.

## Integration (teamlead)

- After S2 to S5: `pnpm check-types`, `pnpm check:web-type-graph`, `pnpm lint`,
  `pnpm format:check`, `pnpm test:api`, `pnpm test:e2e`.
- A full e2e pass against the real API, without stubs, for US-1.1 and US-4.1. It catches
  mismatches between S2/S3 and S4 that each slice's own tests can't see.
- Follow-up issues: remove `code` and `error` in 0.9.0 (US-6.2), per-field display of server
  `validation` errors in forms.
- Bookkeeping: PRD `Status: implemented`, `specs/standards/README.md` row, `specs/overview.md`,
  `pnpm specs:index`, `Closes #172` and `Closes #293` in the PR body.
