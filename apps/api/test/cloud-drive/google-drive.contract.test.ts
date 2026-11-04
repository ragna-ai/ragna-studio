import { resolveUserCloudDrive } from '@repo/integrations/cloud-drive';
import {
  DRIVE_DOC,
  DRIVE_CREATED_FILE_ID,
  DRIVE_FOLDER,
  DRIVE_FORM,
  DRIVE_IMAGE,
  DRIVE_LARGE_FILE,
  DRIVE_MISSING_ID,
  DRIVE_NOTES,
  DRIVE_PAGE_SIZE,
  DRIVE_PDF,
  DRIVE_READ_ONLY_FILE,
  DRIVE_ROOT_CHILDREN,
  DRIVE_SEARCH_QUERY,
  DRIVE_SHARED_FILE,
  DRIVE_SHEET,
  DRIVE_SLIDES,
  GOOGLE_DRIVE_ENDPOINTS,
  GOOGLE_DRIVE_RATE_LIMIT_BODY,
  recordVendorSleep,
  resetProviderMocks,
  seedAuthenticatedUser,
  seedGoogleDriveConnection,
  truncateAllTables,
  vendorRequestsTo,
} from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';
import { runCloudDriveContract } from './support/cloud-drive-contract';

runCloudDriveContract({
  vendor: {
    name: 'Google Drive',
    integrationId: 'google-drive',
    seedConnection: seedGoogleDriveConnection,
    assertSearchRequest: (request, query) => {
      const { searchParams } = request.url;
      expect(searchParams.get('supportsAllDrives')).toBe('true');
      expect(searchParams.get('includeItemsFromAllDrives')).toBe('true');
      expect(searchParams.get('corpora')).toBe('allDrives');
      const q = searchParams.get('q') ?? '';
      expect(q).toContain('trashed = false');
      expect(q).toContain('fullText contains');
      expect(q).toContain('name contains');
      expect(q).toContain(query.replaceAll('\\', '\\\\').replaceAll("'", "\\'"));
    },
    rateLimitedBodies: [{ status: 403, body: GOOGLE_DRIVE_RATE_LIMIT_BODY }],
  },
  fixtures: {
    folder: DRIVE_FOLDER,
    doc: DRIVE_DOC,
    sheet: DRIVE_SHEET,
    slides: DRIVE_SLIDES,
    pdf: DRIVE_PDF,
    image: DRIVE_IMAGE,
    sharedFile: DRIVE_SHARED_FILE,
    form: DRIVE_FORM,
    notes: DRIVE_NOTES,
    readOnlyFile: DRIVE_READ_ONLY_FILE,
    createdFileId: DRIVE_CREATED_FILE_ID,
    largeFile: DRIVE_LARGE_FILE,
    missingId: DRIVE_MISSING_ID,
    searchQuery: DRIVE_SEARCH_QUERY,
    rootChildren: DRIVE_ROOT_CHILDREN,
    pageSize: DRIVE_PAGE_SIZE,
  },
  endpoints: GOOGLE_DRIVE_ENDPOINTS,
});

describe('google drive uploads', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetProviderMocks();
  });

  async function connectedProvider() {
    const { userId } = await seedAuthenticatedUser();
    await seedGoogleDriveConnection({ userId });
    const resolved = await resolveUserCloudDrive({
      userId,
      integrationId: 'google-drive',
      sleep: recordVendorSleep,
    });
    if (resolved.status !== 'ready') throw new Error(`Drive not ready: ${resolved.status}`);
    return resolved.provider;
  }

  test('creates a file with one multipart upload carrying name, parent and mime type', async () => {
    const provider = await connectedProvider();

    await provider.createFile({
      name: 'budget.csv',
      folderId: DRIVE_FOLDER.id,
      format: 'csv',
      content: 'a,b\n1,2',
    });

    const [request] = vendorRequestsTo(GOOGLE_DRIVE_ENDPOINTS.create);
    expect(request?.url.searchParams.get('uploadType')).toBe('multipart');
    expect(request?.url.searchParams.get('supportsAllDrives')).toBe('true');
    expect(request?.headers.get('content-type')).toStartWith('multipart/related; boundary=');
    expect(request?.body).toContain(
      JSON.stringify({ name: 'budget.csv', mimeType: 'text/csv', parents: [DRIVE_FOLDER.id] }),
    );
    expect(request?.body).toContain('Content-Type: text/csv');
    expect(request?.body).toContain('a,b\n1,2');
  });

  test('creates a root file without a parent', async () => {
    const provider = await connectedProvider();

    await provider.createFile({
      name: 'a.md',
      folderId: null,
      format: 'markdown',
      content: '# A',
    });

    const [request] = vendorRequestsTo(GOOGLE_DRIVE_ENDPOINTS.create);
    expect(request?.body).toContain(JSON.stringify({ name: 'a.md', mimeType: 'text/markdown' }));
  });

  test('updates with a media upload that keeps the file own mime type', async () => {
    const provider = await connectedProvider();

    await provider.updateFileContent({ itemId: DRIVE_NOTES.id, content: 'new text' });

    const [request] = vendorRequestsTo(GOOGLE_DRIVE_ENDPOINTS.update);
    expect(request?.method).toBe('PATCH');
    expect(request?.url.searchParams.get('uploadType')).toBe('media');
    expect(request?.url.searchParams.get('supportsAllDrives')).toBe('true');
    expect(request?.headers.get('content-type')).toBe('text/plain');
    expect(request?.body).toBe('new text');
  });
});
