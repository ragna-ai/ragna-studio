# Integrations: cloud drive (design)

> **Status: implemented** (2026-11-04, PR #276). Issue #265. Requirements: [prd.md](./prd.md).

How the cloud drive capability, its agent tools and the connection binding are built. Story IDs
refer to the PRD.

## Catalog

- Rename the unused category `files` to `cloud-drive`. No entry uses it yet, so nothing migrates.
- Add `google-drive`: provider `google`, category `cloud-drive`, scopes
  `https://www.googleapis.com/auth/drive.readonly` and `https://www.googleapis.com/auth/drive.file`.
- OneDrive phase: add `onedrive`: provider `microsoft`, scopes `Files.ReadWrite.All`.
- `integrationIdSchema` gets the new ids. `IntegrationIdIn<'cloud-drive'>` types the registry.

Connecting uses the existing flow (`POST` connect with `integrationId: 'google-drive'`).
Incremental scopes already merge with the Gmail grant (US-1.1).

## Connection binding (US-1.3 to US-1.5)

Today a connection serves every integration its scopes cover. Scopes can't shrink at the
provider, so "turn Drive off" needs a local record.

- New column `integration_connections.enabled_integrations text[] not null`.
- A connection serves an integration when it is in `enabled_integrations` **and** the scopes
  cover it. `listCoveredIntegrationIds` and `createIntegrationTokenGetter` check both. A disabled
  integration throws `ConnectionIntegrationDisabledError`, which tools map to "not connected".
- Connecting adds the integration id. Turning it off removes it.
- New route `DELETE /integration/connection/:connectionId/integrations/:integrationId`. When the
  list becomes empty, the connection is revoked and removed as today (US-1.5).
- Mailbox disconnect only unbinds `gmail` / `outlook-mail` and calls the same function, so a
  connection that still serves Drive stays (US-1.4). #224 design already noted this.
- **Migration path:** the generated migration backfills each row with the integration ids its
  scopes cover today (`gmail`, `outlook-mail`, `linkedin-posting` by provider and scope). No
  user reconnects.

## Capability module `@repo/integrations/cloud-drive`

A module, not a new package. It needs no dependencies beyond the package's own (fetch, zod) and
the shared vendor client from #272. Text extraction stays in `@repo/media`, called by the tools.

```
packages/integrations/src/cloud-drive/
  cloud-drive.types.ts   # contract + zod schemas
  index.ts               # registry, resolver, public exports
  errors.ts              # CloudDriveError kinds
  google/
    google-drive.provider.ts
    google-drive.client.ts
    google-drive.parse.ts
    google-drive.types.ts
```

New subpath export `./cloud-drive` in `package.json`.

### Contract

```ts
export type CloudDriveItemKind = 'folder' | 'file';

export interface CloudDriveItem {
  id: string; // opaque, only valid with its connection
  name: string;
  kind: CloudDriveItemKind;
  mimeType: string | null;
  sizeBytes: number | null;
  modifiedAt: Date;
  webUrl: string;
}

export interface CloudDrivePage {
  items: CloudDriveItem[];
  nextCursor: string | null; // opaque: page token or next link
}

export interface CloudDriveFileContent {
  item: CloudDriveItem; // metadata loaded for the read, so callers need no second call
  mimeType: string; // after export for vendor-native files
  bytes: Buffer;
}

export interface CloudDriveProvider {
  search(params: { query: string; cursor?: string }): Promise<CloudDrivePage>;
  listFolder(params: { folderId: string | null; cursor?: string }): Promise<CloudDrivePage>;
  getItem(params: { itemId: string }): Promise<CloudDriveItem>;
  readContent(params: { itemId: string; maxBytes: number }): Promise<CloudDriveFileContent>;
  createFile(params: CreateCloudDriveFileParams): Promise<CloudDriveItem>;
  updateFileContent(params: UpdateCloudDriveFileParams): Promise<CloudDriveItem>;
}
```

`folderId: null` means the drive root. `query` is plain text. Each vendor turns it into its own
syntax and escapes it.

### Errors

One `CloudDriveError` with `kind`: `not_found`, `read_only`, `too_large`, `rate_limited`,
`auth`. Adapters map `VendorApiError` into it. Callers never see vendor bodies.

Google answers a write to a file outside `drive.file` with `403` and the reasons
`appNotAuthorizedToFile` or `insufficientFilePermissions`. The shared client classifies every
`403` as `auth` and retries it. The Google adapter maps those two codes to `read_only` (US-5.3).
Follow-up in the shared client: don't retry a `403` whose code says permission, not token. Until
then a `read_only` answer is retried 3 times before it fails.

### Registry and resolver

```ts
const CLOUD_DRIVE_PROVIDERS: Record<IntegrationIdIn<'cloud-drive'>, CloudDriveProviderFactory> = {
  'google-drive': createGoogleDriveProvider,
};

export function resolveUserCloudDrive(params: {
  userId: string;
  integrationId: IntegrationIdIn<'cloud-drive'>;
}): Promise<ResolvedCloudDrive>;
// ResolvedCloudDrive = { status: 'ready'; provider; connectionId } | { status: 'not_connected' }
//                    | { status: 'needs_reauth'; connectionId }
```

The resolver finds the run user's connection for the integration's provider (one per provider,
#224) and checks it serves that integration. It builds a token getter with
`createIntegrationTokenGetter` and a new provider per call. Nothing is cached across users or runs.

### Google adapter

- Base `https://www.googleapis.com/drive/v3` via `googleApi()`.
- Every list and search sends `supportsAllDrives=true`, `includeItemsFromAllDrives=true` and
  `corpora=allDrives`, plus `trashed = false`. Without them shared-drive files are missing
  (seen in other Drive MCP servers).
- Search: `fullText contains '<escaped>' or name contains '<escaped>'`. Cursor = `pageToken`.
- Native files are exported: Docs to `text/markdown`, Sheets to `text/csv` (first sheet only,
  Google's export rule), Slides to `text/plain`. Other native types count as unsupported.
- Other files download with `alt=media`. The size check comes from metadata before download.
- Create and update use the upload endpoint (`uploadType=multipart`).

## Agent tools (`@repo/ai`)

Each drive integration is its own tool on the agent, with its own access level (US-2, US-6.3).

- New column `agents.integration_tools jsonb not null default '{}'`, typed
  `Partial<Record<IntegrationIdIn<'cloud-drive'>, 'read' | 'write'>>`. A key present means the
  drive is on. `read` is the default when the editor turns it on (US-2.1). The zod schema rejects
  other levels and unknown ids (US-2.4). Same shape as `McpAccess`.
- Keyed by catalog integration id, so there is no second id list. `agentToolValues` stays as it
  is. Integration actions from #229 can use the same column later.
- The agent tools page gets one row per cloud-drive catalog entry (Google Drive now, OneDrive
  later), each with a toggle and a read-only / read-and-write selector. Agent templates don't
  carry drive settings in v1.
- `cloud-drive.tools.ts` exports `cloudDriveToolDefinitions(integrationId)`: five
  `ToolDefinition`s whose names start with the camel-cased integration id (`google-drive` gives
  `googleDriveSearch`). Each `inputSchema` is a flat `z.object`.

| Tool (Google Drive)     | Access | Input                                    |
| ----------------------- | ------ | ---------------------------------------- |
| `googleDriveSearch`     | read   | `query`, `cursor?`                       |
| `googleDriveListFolder` | read   | `folderId?`, `cursor?`                   |
| `googleDriveReadFile`   | read   | `fileId`                                 |
| `googleDriveCreateFile` | write  | `name`, `folderId?`, `format`, `content` |
| `googleDriveUpdateFile` | write  | `fileId`, `content`                      |

- `AgentToolContext` gets `integrationTools`. `buildAgentToolset` adds, per drive, the
  definitions its level allows, like `getAllowedToolDefinitions` for MCP. Its signature is
  unchanged.
- The description of each tool names the drive, so the model can tell two drives apart.
- `format` is `markdown`, `text` or `csv`. Created files are plain files of that type. Native
  Google Docs or Word output is a later option.
- `readFile` passes the bytes to `extractText` from `@repo/media` for `pdf`, `docx`, `pptx`,
  `xlsx`, `csv`, `txt`, `md`. Limits: 20 MB download, 100,000 characters of text, then cut with
  `truncated: true` (US-3.3, US-3.4).
- Results are a discriminated union on `status`: `ok`, `not_connected`, `reconnect`, `not_found`,
  `read_only`, `unsupported`, `too_large`, `busy`. Each non-`ok` result carries a short message
  for the model. Results name the connection's email, never a token.

### Run user (US-3.5, US-5.4)

`AgentToolContext.userId` is already the run user: the chatting user in `chat.service.ts`, the
run user in `run-referenced-agent.ts` and `team.executor.ts` (`resolveScheduledRunUserId` for
schedules). The tools call `resolveUserCloudDrive({ userId: ctx.userId, integrationId })`. Nothing else is
needed until workspace connections (#190) add an explicit connection id.

### Approval in chat (US-5.1, US-5.2)

- `chat.service.ts` passes `toolApproval` with `'user-approval'` for every cloud drive write tool
  in the toolset (`buildCloudDriveToolApproval`). Dataset and document writes keep running without
  approval, as before. A new drive write tool needs no change in the chat service.
- `experimental_toolApprovalSecret` is a key derived from `APP_KEY` (`getToolApprovalSecret` in
  `@repo/crypto`, its own HKDF label). Rotating `APP_KEY` cancels pending approvals.
- The client continues a paused turn by re-sending the stored assistant message. The server takes
  only the approve or deny decision for approval ids it stored as pending
  (`answerPendingApprovals`). Tool input and signature stay as stored. An unknown or already
  answered id writes nothing.
- A new user message while an approval is open marks it denied (`denyOpenApprovals`), so the
  model sees a denial and the chat goes on.
- The web chat renders the `approval-requested` part with name, folder and content, and answers
  with `addToolApprovalResponse`. `ToolStatusBadge` already knows the states.
- Worker runs (`generateText`) pass no `toolApproval`, so writes run directly.

## Testing

- **HTTP fake:** add `www.googleapis.com/drive/v3` and `/upload/drive/v3` to `VENDOR_HOSTS`, and
  `packages/testing/src/cloud-drive/vendors/google-drive.routes.ts` plus a `drive.fixture.ts`
  with trimmed real payloads (a folder, a Doc, a Sheet, a PDF, a shared-drive file).
- **Contract suite:** `apps/api/test/cloud-drive/support/cloud-drive-contract.ts` exports
  `runCloudDriveContract({ vendor, seedConnection, fixtures, endpoints })`. It covers search,
  list with cursor, read per type, not found, token rejected, rate limited, read only, not
  connected. `google-drive.contract.test.ts` calls it and adds the export and shared-drive cases.
- Tools are executed directly from `buildAgentToolset`, as in `web-browser-tool.test.ts`.
- **Worker:** an unattended run with a read-and-write agent creates a file without approval.

## Extension points

- **Axis:** vendor. **Contract:** `CloudDriveProvider`.
- **Known variants:** Google Drive (#265, P1), OneDrive and SharePoint (#265, P3).
- **Adding OneDrive:** a catalog entry `onedrive`, `src/cloud-drive/microsoft/` on
  `MICROSOFT_GRAPH_API` (search `/me/drive/root/search(q=...)`, cursor = `@odata.nextLink`),
  one registry entry, `graph-drive.routes.ts`, and a contract test file. The agent tools page and
  the toolset pick the new entry up from the catalog. Nothing else changes.
- **Fakes:** vendor HTTP in `packages/testing`. No package-level mock of the provider.
- **Packages considered:** `googleapis` and `@microsoft/microsoft-graph-client`. Rejected: the
  shared vendor client from #272 already covers auth, retries and errors, and both SDKs are
  large. No new dependency, so no dependency-choice record.
- **Not abstracted:** vendor-native export formats and the search syntax stay in each adapter.
  The tool layer doesn't know which vendor runs.

## Risks

- **Google review:** restricted scopes need verification and a yearly security assessment
  before the hosted app leaves testing mode. Submit Drive with Gmail. Self-hosters with an
  internal Workspace app aren't affected.
- **Testing mode tokens:** refresh tokens of apps in testing mode expire after 7 days. A dev
  connection needs a weekly reconnect.
- **Text size:** 100,000 characters can still fill a small model's context. Revisit per model.
