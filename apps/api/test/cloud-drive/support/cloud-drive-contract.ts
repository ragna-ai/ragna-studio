// apps/api/test/cloud-drive/support/cloud-drive-contract.ts
//
// Shared scenarios every cloud drive vendor must pass, run at provider level: the real adapter
// resolved through resolveUserCloudDrive, against the vendor HTTP fake. Each vendor's contract
// test file calls runCloudDriveContract once, then adds its vendor-only cases.
import {
  CloudDriveError,
  resolveUserCloudDrive,
  type CloudDriveErrorKind,
  type CloudDriveProvider,
} from '@repo/integrations/cloud-drive';
import type { CloudDriveIntegrationId } from '@repo/integrations';
import { extractText } from '@repo/media';
import {
  expireConnectionAccessToken,
  failVendorEndpoint,
  providerHttp,
  recordVendorSleep,
  resetProviderMocks,
  seedAuthenticatedUser,
  seedIntegrationConnection,
  truncateAllTables,
  vendorHttp,
  vendorRequestsTo,
  type DriveFixtureFile,
  type VendorEndpoint,
  type VendorRequest,
} from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';

const MAX_BYTES = 1024 * 1024;

export interface CloudDriveContractVendor {
  name: string;
  integrationId: CloudDriveIntegrationId;
  /** Seeds the user's connection with this drive enabled and its scopes granted. */
  seedConnection: (params: { userId: string }) => Promise<unknown>;
  /** Asserts the search call asked the vendor for everything the user can reach. */
  assertSearchRequest: (request: VendorRequest, query: string) => void;
  /** Answers that mean "slow down" in the vendor's own format, besides a plain 429. */
  rateLimitedBodies: Array<{ status: number; body: unknown }>;
}

export interface CloudDriveContractFixtures {
  folder: DriveFixtureFile;
  doc: DriveFixtureFile;
  sheet: DriveFixtureFile;
  slides: DriveFixtureFile;
  pdf: DriveFixtureFile;
  image: DriveFixtureFile;
  sharedFile: DriveFixtureFile;
  form: DriveFixtureFile;
  /** A plain text file the connection may update. */
  notes: DriveFixtureFile;
  /** A text file the vendor refuses writes to. */
  readOnlyFile: DriveFixtureFile;
  /** The id the fake gives every created file. */
  createdFileId: string;
  largeFile: DriveFixtureFile;
  missingId: string;
  searchQuery: string;
  /** What the fake lists in the root, in order, and how many fit on a page. */
  rootChildren: readonly DriveFixtureFile[];
  pageSize: number;
}

export interface CloudDriveContractEndpoints {
  list: VendorEndpoint;
  file: VendorEndpoint;
  export: VendorEndpoint;
  create: VendorEndpoint;
  update: VendorEndpoint;
}

export interface CloudDriveContractParams {
  vendor: CloudDriveContractVendor;
  fixtures: CloudDriveContractFixtures;
  endpoints: CloudDriveContractEndpoints;
}

async function expectDriveError(call: Promise<unknown>, kind: CloudDriveErrorKind): Promise<void> {
  const error = await call.then(
    () => null,
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(CloudDriveError);
  expect(error instanceof CloudDriveError ? error.kind : null).toBe(kind);
}

export function runCloudDriveContract({
  vendor,
  fixtures,
  endpoints,
}: CloudDriveContractParams): void {
  describe(`cloud drive contract: ${vendor.name}`, () => {
    beforeEach(async () => {
      await truncateAllTables();
      resetProviderMocks();
    });

    async function connectedDrive(): Promise<{
      provider: CloudDriveProvider;
      userId: string;
      connectionId: string;
    }> {
      const { userId } = await seedAuthenticatedUser();
      await vendor.seedConnection({ userId });
      const resolved = await resolveUserCloudDrive({
        userId,
        integrationId: vendor.integrationId,
        sleep: recordVendorSleep,
      });
      if (resolved.status !== 'ready') throw new Error(`Drive not ready: ${resolved.status}`);
      return { provider: resolved.provider, userId, connectionId: resolved.connectionId };
    }

    test('search reaches shared drives and returns files and folders from them', async () => {
      const { provider } = await connectedDrive();

      const page = await provider.search({ query: fixtures.searchQuery });

      expect(page.items.map((item) => item.id)).toContain(fixtures.sharedFile.id);
      const shared = page.items.find((item) => item.id === fixtures.sharedFile.id);
      expect(shared?.name).toBe(fixtures.sharedFile.name);
      expect(shared?.kind).toBe('file');
      expect(shared?.mimeType).toBe(fixtures.sharedFile.mimeType);
      expect(shared?.sizeBytes).toBe(fixtures.sharedFile.sizeBytes);
      expect(shared?.modifiedAt).toEqual(fixtures.sharedFile.modifiedAt);
      expect(shared?.webUrl).toBe(fixtures.sharedFile.webUrl);
      const [request] = vendorRequestsTo(endpoints.list);
      if (!request) throw new Error('The vendor received no search request');
      vendor.assertSearchRequest(request, fixtures.searchQuery);
    });

    test('lists the root page by page with an opaque cursor', async () => {
      const { provider } = await connectedDrive();

      const first = await provider.listFolder({ folderId: null });
      expect(first.items.map((item) => item.id)).toEqual(
        fixtures.rootChildren.slice(0, fixtures.pageSize).map((file) => file.id),
      );
      expect(first.items[0]?.kind).toBe('folder');
      expect(first.nextCursor).not.toBeNull();

      const second = await provider.listFolder({
        folderId: null,
        cursor: first.nextCursor ?? undefined,
      });
      expect(second.items.map((item) => item.id)).toEqual(
        fixtures.rootChildren.slice(fixtures.pageSize).map((file) => file.id),
      );
      expect(second.nextCursor).toBeNull();
    });

    test('lists a folder, including files that live in a shared drive', async () => {
      const { provider } = await connectedDrive();

      const first = await provider.listFolder({ folderId: fixtures.folder.id });
      const second = await provider.listFolder({
        folderId: fixtures.folder.id,
        cursor: first.nextCursor ?? undefined,
      });

      const ids = first.items.concat(second.items).map((item) => item.id);
      expect(ids).toEqual([fixtures.pdf.id, fixtures.image.id, fixtures.sharedFile.id]);
    });

    test('gets one item', async () => {
      const { provider } = await connectedDrive();

      const item = await provider.getItem({ itemId: fixtures.doc.id });

      expect(item.id).toBe(fixtures.doc.id);
      expect(item.name).toBe(fixtures.doc.name);
      expect(item.kind).toBe('file');
      expect(item.sizeBytes).toBeNull();
    });

    test.each([
      ['doc', 'text/markdown'],
      ['sheet', 'text/csv'],
      ['slides', 'text/plain'],
    ] as const)('reads a %s as exported text (%s)', async (name, mimeType) => {
      const { provider } = await connectedDrive();
      const file = fixtures[name];

      const content = await provider.readContent({ itemId: file.id, maxBytes: MAX_BYTES });

      expect(content.mimeType).toBe(mimeType);
      expect(content.item.id).toBe(file.id);
      expect(content.item.name).toBe(file.name);
      expect(content.bytes.toString('utf-8')).toBe(file.exportText ?? '');
      const [exportRequest] = vendorRequestsTo(endpoints.export);
      expect(exportRequest?.url.searchParams.get('mimeType')).toBe(mimeType);
    });

    test('reads a PDF as bytes the text extractor can read', async () => {
      const { provider } = await connectedDrive();

      const content = await provider.readContent({ itemId: fixtures.pdf.id, maxBytes: MAX_BYTES });

      expect(content.mimeType).toBe('application/pdf');
      expect(content.bytes.equals(fixtures.pdf.bytes ?? Buffer.alloc(0))).toBe(true);
      const text = await extractText({ buffer: content.bytes, kind: 'pdf' });
      expect(text).toContain('Quarterly figures');
    });

    test('returns image bytes and leaves the decision to the tool', async () => {
      const { provider } = await connectedDrive();

      const content = await provider.readContent({
        itemId: fixtures.image.id,
        maxBytes: MAX_BYTES,
      });

      expect(content.mimeType).toBe('image/png');
      expect(content.bytes.equals(fixtures.image.bytes ?? Buffer.alloc(0))).toBe(true);
    });

    test('reads a file from a shared drive', async () => {
      const { provider } = await connectedDrive();

      const content = await provider.readContent({
        itemId: fixtures.sharedFile.id,
        maxBytes: MAX_BYTES,
      });

      expect(content.bytes.equals(fixtures.sharedFile.bytes ?? Buffer.alloc(0))).toBe(true);
    });

    test('rejects a native type it cannot export as unsupported', async () => {
      const { provider } = await connectedDrive();

      await expectDriveError(
        provider.readContent({ itemId: fixtures.form.id, maxBytes: MAX_BYTES }),
        'unsupported',
      );
    });

    test('rejects a folder as unsupported', async () => {
      const { provider } = await connectedDrive();

      await expectDriveError(
        provider.readContent({ itemId: fixtures.folder.id, maxBytes: MAX_BYTES }),
        'unsupported',
      );
    });

    test('rejects a file over the limit before downloading it', async () => {
      const { provider } = await connectedDrive();

      await expectDriveError(
        provider.readContent({ itemId: fixtures.largeFile.id, maxBytes: MAX_BYTES }),
        'too_large',
      );
      expect(
        vendorRequestsTo(endpoints.file).filter(
          (request) => request.url.searchParams.get('alt') === 'media',
        ),
      ).toHaveLength(0);
    });

    test('rejects exported text over the limit', async () => {
      const { provider } = await connectedDrive();

      await expectDriveError(
        provider.readContent({ itemId: fixtures.doc.id, maxBytes: 4 }),
        'too_large',
      );
    });

    test('reports a missing item as not_found', async () => {
      const { provider } = await connectedDrive();

      await expectDriveError(provider.getItem({ itemId: fixtures.missingId }), 'not_found');
      await expectDriveError(
        provider.readContent({ itemId: fixtures.missingId, maxBytes: MAX_BYTES }),
        'not_found',
      );
    });

    test('maps a token the vendor keeps rejecting to auth after refreshing it', async () => {
      const { provider, connectionId } = await connectedDrive();
      await expireConnectionAccessToken({ connectionId });
      failVendorEndpoint(endpoints.list, { status: 401 });

      await expectDriveError(provider.search({ query: fixtures.searchQuery }), 'auth');
      expect(providerHttp.tokenRequests.length).toBeGreaterThan(0);
    });

    test('maps 429 to rate_limited after waiting as the vendor asked', async () => {
      const { provider } = await connectedDrive();
      failVendorEndpoint(endpoints.list, { status: 429, headers: { 'Retry-After': '2' } });

      await expectDriveError(provider.search({ query: fixtures.searchQuery }), 'rate_limited');
      expect(vendorHttp.sleeps.length).toBeGreaterThan(0);
      expect(vendorHttp.sleeps.every((ms) => ms === 2000)).toBe(true);
    });

    test("maps the vendor's own rate limit answer to rate_limited", async () => {
      for (const { status, body } of vendor.rateLimitedBodies) {
        const { provider } = await connectedDrive();
        failVendorEndpoint(endpoints.list, { status, body });

        await expectDriveError(provider.search({ query: fixtures.searchQuery }), 'rate_limited');
      }
    });

    test('reads a file with one metadata call', async () => {
      const { provider } = await connectedDrive();

      await provider.readContent({ itemId: fixtures.notes.id, maxBytes: MAX_BYTES });

      const metadataCalls = vendorRequestsTo(endpoints.file).filter(
        (request) => request.url.searchParams.get('alt') !== 'media',
      );
      expect(metadataCalls).toHaveLength(1);
    });

    test.each([
      ['markdown', 'report.md'],
      ['text', 'report.txt'],
      ['csv', 'report.csv'],
    ] as const)('creates a %s file in the root', async (format, name) => {
      const { provider } = await connectedDrive();

      const item = await provider.createFile({ name, folderId: null, format, content: 'a,b\n1,2' });

      expect(item.id).toBe(fixtures.createdFileId);
      expect(item.name).toBe(name);
      expect(item.kind).toBe('file');
      expect(vendorRequestsTo(endpoints.create)).toHaveLength(1);
    });

    test('creates a file inside a folder', async () => {
      const { provider } = await connectedDrive();

      const item = await provider.createFile({
        name: 'summary.md',
        folderId: fixtures.folder.id,
        format: 'markdown',
        content: '# Summary',
      });

      expect(item.id).toBe(fixtures.createdFileId);
      expect(vendorRequestsTo(endpoints.create)).toHaveLength(1);
    });

    test('updates the content of a text file', async () => {
      const { provider } = await connectedDrive();

      const item = await provider.updateFileContent({
        itemId: fixtures.notes.id,
        content: 'Meeting notes, revised\n',
      });

      expect(item.id).toBe(fixtures.notes.id);
      expect(item.name).toBe(fixtures.notes.name);
      expect(vendorRequestsTo(endpoints.update)).toHaveLength(1);
    });

    test('reports a file the connection may not change as read_only', async () => {
      const { provider } = await connectedDrive();

      await expectDriveError(
        provider.updateFileContent({ itemId: fixtures.readOnlyFile.id, content: 'changed' }),
        'read_only',
      );
    });

    test.each([
      ['a native document', 'doc'],
      ['a PDF', 'pdf'],
      ['a folder', 'folder'],
    ] as const)('rejects updating %s as unsupported without uploading', async (_label, key) => {
      const { provider } = await connectedDrive();

      await expectDriveError(
        provider.updateFileContent({ itemId: fixtures[key].id, content: 'changed' }),
        'unsupported',
      );
      expect(vendorRequestsTo(endpoints.update)).toHaveLength(0);
    });

    test('reports updating a missing item as not_found', async () => {
      const { provider } = await connectedDrive();

      await expectDriveError(
        provider.updateFileContent({ itemId: fixtures.missingId, content: 'x' }),
        'not_found',
      );
    });

    test('resolves to not_connected without a connection', async () => {
      const { userId } = await seedAuthenticatedUser();

      const resolved = await resolveUserCloudDrive({ userId, integrationId: vendor.integrationId });

      expect(resolved).toEqual({ status: 'not_connected' });
    });

    test('resolves to needs_reauth with the connection id', async () => {
      const { userId } = await seedAuthenticatedUser();
      const { connection } = await seedIntegrationConnection({
        userId,
        provider: 'google',
        integrationIds: [vendor.integrationId],
        status: 'needs_reauth',
      });

      const resolved = await resolveUserCloudDrive({ userId, integrationId: vendor.integrationId });

      expect(resolved).toEqual({ status: 'needs_reauth', connectionId: connection.id });
    });

    test('resolves to not_connected when the connection has the drive switched off', async () => {
      const { userId } = await seedAuthenticatedUser();
      await seedIntegrationConnection({ userId, provider: 'google', integrationIds: ['gmail'] });

      const resolved = await resolveUserCloudDrive({ userId, integrationId: vendor.integrationId });

      expect(resolved).toEqual({ status: 'not_connected' });
    });

    test("never resolves another user's connection", async () => {
      const owner = await seedAuthenticatedUser();
      await vendor.seedConnection({ userId: owner.userId });
      const other = await seedAuthenticatedUser();

      const resolved = await resolveUserCloudDrive({
        userId: other.userId,
        integrationId: vendor.integrationId,
      });

      expect(resolved).toEqual({ status: 'not_connected' });
    });
  });
}
