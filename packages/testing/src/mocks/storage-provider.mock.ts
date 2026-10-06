// packages/testing/src/mocks/storage-provider.mock.ts
//
// Mocks `@repo/storage`'s network-touching surface: `uploadObjectBuffer`,
// `downloadObjectBuffer`, and `deleteObjects` are thin wrappers around a
// real S3-compatible client with no business logic of their own worth
// preserving in tests, matching docs/testing/strategy.md's "External
// boundaries" (mocked at the package boundary). Everything else the
// package exports (`toPublicMediaUrl`, the bucket-name
// helpers) is a pure function with no I/O, so it stays real via the spread
// below rather than being reimplemented here.
//
// `@repo/media`'s sniffing/extraction (`sniffMediaKind`, `extractText`) are
// also pure/local (anydoc runs on the libuv threadpool, not over the
// network) and stay real and unmocked; only `@repo/storage`'s bytes-over-
// the-wire calls need faking.
//
// Lives here (not app-local) so both apps/api and apps/worker's test
// suites can register the same fake: apps/worker's agent-context-document
// processor calls `extractDocumentText` (@repo/storage), which downloads
// through this same package.
//
// Unlike the `ai` mock (ai-provider.mock.ts), this package is imported
// directly by apps/api and apps/worker (not indirectly through another
// bundled workspace package), so mocking `@repo/storage` itself, not some
// npm dependency underneath it, is the right boundary here.
import { mock } from 'bun:test';
import * as storagePackage from '@repo/storage';

type UploadObjectBufferFn = typeof storagePackage.uploadObjectBuffer;
type DownloadObjectBufferFn = typeof storagePackage.downloadObjectBuffer;
type DeleteObjectsFn = typeof storagePackage.deleteObjects;

function defaultUploadObjectBufferImpl(
  params: Parameters<UploadObjectBufferFn>[0],
): ReturnType<UploadObjectBufferFn> {
  return Promise.resolve({ success: true, key: params.key });
}

function defaultDownloadObjectBufferImpl(): ReturnType<DownloadObjectBufferFn> {
  return Promise.resolve({
    buffer: Buffer.from('fake object bytes from storage-provider.mock.ts'),
    contentType: 'application/octet-stream',
  });
}

function defaultDeleteObjectsImpl(
  _bucketName: Parameters<DeleteObjectsFn>[0],
  keys: Parameters<DeleteObjectsFn>[1],
): ReturnType<DeleteObjectsFn> {
  return Promise.resolve({ deleted: keys, errors: [] });
}

export const uploadObjectBufferMock = mock<UploadObjectBufferFn>(defaultUploadObjectBufferImpl);
export const downloadObjectBufferMock = mock<DownloadObjectBufferFn>(
  defaultDownloadObjectBufferImpl,
);
export const deleteObjectsMock = mock<DeleteObjectsFn>(defaultDeleteObjectsImpl);

export function resetStorageProviderMock(): void {
  uploadObjectBufferMock.mockClear();
  uploadObjectBufferMock.mockImplementation(defaultUploadObjectBufferImpl);
  downloadObjectBufferMock.mockClear();
  downloadObjectBufferMock.mockImplementation(defaultDownloadObjectBufferImpl);
  deleteObjectsMock.mockClear();
  deleteObjectsMock.mockImplementation(defaultDeleteObjectsImpl);
}

mock.module('@repo/storage', () => ({
  ...storagePackage,
  uploadObjectBuffer: uploadObjectBufferMock,
  downloadObjectBuffer: downloadObjectBufferMock,
  deleteObjects: deleteObjectsMock,
}));
