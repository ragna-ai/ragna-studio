# Integrations: cloud drive slices

> Build plan for [prd.md](./prd.md) and [design.md](./design.md). Every slice follows AGENTS.md
> and loads the clean-code and integration-connector skills, plus tdd for `apps/api` and the
> packages it reaches. Docs follow the docs-writing skill. Each slice runs its own tests and
> `pnpm check-types` before it reports done.

## Order

| Wave | Slices (parallel within a wave) | Needs                     |
| ---- | ------------------------------- | ------------------------- |
| 0    | S0 Contracts and schema         | nothing                   |
| 1    | S1, S2, S4                      | S0 merged into the branch |
| 2    | S3, S6                          | S2 fakes and fixtures     |
| 3    | S5 (P2 writes)                  | S3                        |
| 4    | Integration pass (lead)         | all                       |

OneDrive (US-6) is its own PR after this one. It follows the "Adding OneDrive" steps in
design.md.

## Contracts shared by all slices

Frozen by S0. A slice that needs a change asks the lead, it doesn't edit another slice's files.

```ts
// @repo/integrations/catalog
type IntegrationCategory = 'mail' | 'calendar' | 'cloud-drive' | 'social';
type CloudDriveIntegrationId = IntegrationIdIn<'cloud-drive'>; // 'google-drive'

// @repo/integrations/cloud-drive: CloudDriveProvider, CloudDriveItem, CloudDrivePage,
// CloudDriveFileContent as in design.md, plus:
type CloudDriveErrorKind = 'not_found' | 'read_only' | 'too_large' | 'rate_limited' | 'auth';
class CloudDriveError extends Error { kind: CloudDriveErrorKind }
resolveUserCloudDrive({ userId, integrationId }): Promise<ResolvedCloudDrive>;

// @repo/integrations
unbindConnectionIntegration({ connectionId, integrationId }): Promise<void>; // removes the
// connection when nothing is left (US-1.5)
class ConnectionIntegrationDisabledError extends Error { connectionId; integrationId }

// @repo/database
type IntegrationToolAccessLevel = 'read' | 'write';
type IntegrationTools = Partial<Record<CloudDriveIntegrationId, IntegrationToolAccessLevel>>;
// agents.integration_tools, API field `integrationTools`
// integration_connections.enabled_integrations: IntegrationId[]

// @repo/ai: tool result
type CloudDriveToolStatus = 'ok' | 'not_connected' | 'reconnect' | 'not_found' | 'read_only'
  | 'unsupported' | 'too_large' | 'busy';

// @repo/testing (S2 exports, S3 and S5 import)
GOOGLE_DRIVE_ROUTES; DRIVE_FOLDER; DRIVE_DOC; DRIVE_SHEET; DRIVE_SLIDES; DRIVE_PDF;
DRIVE_IMAGE; DRIVE_SHARED_FILE; DRIVE_SEARCH_QUERY;
seedGoogleDriveConnection({ userId, organizationId, withGmail? }): Promise<IntegrationConnection>;
```

## S0 Contracts and schema (lead, before wave 1)

- Catalog: category rename, `google-drive` entry, `integrationIdSchema`.
- `src/cloud-drive/cloud-drive.types.ts`, `errors.ts`, `index.ts` with the registry typed but
  the Google factory stubbed, subpath export `./cloud-drive` in `package.json`.
- `@repo/database`: both columns, their zod refinements, one `db:generate` migration with the
  `enabled_integrations` backfill. Only S0 generates a migration in this build.
- Rebuild `@repo/integrations` and `@repo/database` through pnpm.
- Owns: `packages/integrations/src/catalog/`, `packages/integrations/src/cloud-drive/*.ts`,
  `packages/integrations/package.json`, the schema files, `packages/database/drizzle/`.

## S1 Connection binding (US-1.1 to US-1.5)

- Served check (`enabled_integrations` and scopes) in `listCoveredIntegrationIds` and
  `createIntegrationTokenGetter`. Connect adds the id.
- `unbindConnectionIntegration`, route
  `DELETE /integration/connection/:connectionId/integrations/:integrationId`.
- Mailbox disconnect calls `unbindConnectionIntegration` instead of removing the connection.
- `apps/web` connections page: one switch per integration on a connection.
- Owns: `packages/integrations/src/{services,oauth}/`, `packages/integrations/src/errors.ts`,
  `apps/api/src/{controllers,services}/integration*`, the mailbox disconnect in the email
  service, `apps/api/test/integration/`, `apps/web/app/features/integrations/`.

## S2 Google adapter, fakes and contract suite (US-3.1 to US-3.4, US-4.3, US-4.4)

- `src/cloud-drive/google/` read methods: `search`, `listFolder`, `getItem`, `readContent`
  (export of native files, size check before download). Map vendor errors to `CloudDriveError`.
- `resolveUserCloudDrive` and the real registry entry.
- `packages/testing/src/cloud-drive/`: routes, fixtures from trimmed real payloads, seed
  helper. Register the Drive hosts in `vendor-route.ts` and the base routes in
  `vendor-http.mock.ts`.
- `apps/api/test/cloud-drive/support/cloud-drive-contract.ts` (`runCloudDriveContract`) at
  provider level, and `google-drive.contract.test.ts` with the shared-drive and export cases.
- Deliver the fakes and fixtures first and tell the lead, so S3 can start.
- Owns: `packages/integrations/src/cloud-drive/google/`, `cloud-drive/index.ts` (after S0),
  `packages/testing/src/cloud-drive/`, `packages/testing/src/vendor-http/`,
  `packages/testing/src/index.ts`, `apps/api/test/cloud-drive/support/`,
  `apps/api/test/cloud-drive/google-drive.contract.test.ts`.

## S3 Agent read tools (US-2.1 to US-2.4, US-3.5, US-4.1, US-4.2)

- `packages/ai/src/tools/cloud-drive.tools.ts`: the three read definitions per integration,
  results as `CloudDriveToolStatus`, text through `extractText` with the limits in design.md.
- `buildAgentToolset` takes `integrationTools` and filters by level. Pass it from
  `chat.service.ts`, `run-referenced-agent.ts` and `team.executor.ts` (one line each).
- Agent create and update accept `integrationTools` (US-2.4).
- Tests: `apps/api/test/cloud-drive/tools.test.ts` (offered tools per level, two users on one
  shared agent, not connected, reconnect), `apps/api/test/agent/` for validation.
- Owns: `packages/ai/src/tools/cloud-drive.tools.ts`, `agent.tools.ts`, the agent service and
  controller schemas, the three call sites above (toolset line only),
  `apps/api/test/cloud-drive/tools.test.ts`.

## S4 Agent tools page (US-2.1 UI)

- One row per cloud-drive catalog entry: toggle plus read-only / read-and-write selector,
  saved as `integrationTools`. Shows "connect Google Drive first" with the connect action when
  the editor has no Drive connection (the agent still works for other users).
- Works against the S0 contract. No API changes.
- Owns: the agent tools settings components in `apps/web/app/features/agent/`.

## S5 Writes with approval (US-5.1 to US-5.5)

- Google adapter: `createFile`, `updateFileContent` (multipart upload), `read_only` mapping of
  `appNotAuthorizedToFile` and `insufficientFilePermissions`.
- Write definitions in `cloud-drive.tools.ts`. Helper that builds the `toolApproval` map from the
  toolset's write tools. `chat.service.ts` passes it plus `experimental_toolApprovalSecret`.
- Web chat: approval card with name, folder and content (`addToolApprovalResponse`).
- Tests: contract cases for create, update and read only; API test for a forged approval;
  worker test for an unattended write; Playwright test for approve and deny.
- Owns: the Google adapter write methods, `cloud-drive.tools.ts` (after S3), the
  `streamText` call in `chat.service.ts`, the chat tool-part components in `apps/web`,
  `apps/worker/test/workflow/cloud-drive-write.test.ts`, `apps/web/e2e/cloud-drive*.spec.ts`.

## S6 Docs and bookkeeping

- `apps/docs`: new `integrations/cloud-drive.mdx`, updates to `integrations/connections.mdx`,
  `agents/tools.mdx`, and the self-hosting provider page (enable the Drive API, add both
  scopes).
- `specs/overview.md` entry, `pnpm specs:index`. PRD status changes when the PR merges, not here.
- Owns: `apps/docs/src/content/docs/`, `specs/overview.md`, `specs/INDEX.md`.

## Integration pass (lead)

- `pnpm test:api`, `pnpm test:worker`, `pnpm check-types`, `pnpm lint`, `pnpm format:check`.
- Read each slice's self-flagged notes and check them on disk.
