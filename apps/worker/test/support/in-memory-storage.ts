import { downloadObjectBufferMock, uploadObjectBufferMock, deleteObjectsMock } from '@repo/testing';

export interface InMemoryStorage {
  objects: Map<string, Buffer<ArrayBuffer>>;
}

/** Routes the storage mocks through a map, so a job can read back what an earlier step uploaded. */
export function useInMemoryStorage(): InMemoryStorage {
  const objects = new Map<string, Buffer<ArrayBuffer>>();

  uploadObjectBufferMock.mockImplementation(({ key, buffer }) => {
    objects.set(key, Buffer.from(buffer));
    return Promise.resolve({ success: true, key });
  });
  downloadObjectBufferMock.mockImplementation((_bucket, key) => {
    const buffer = objects.get(key);
    if (!buffer) return Promise.reject(new Error(`Object not found: ${key}`));
    return Promise.resolve({ buffer, contentType: 'application/octet-stream' });
  });
  deleteObjectsMock.mockImplementation((_bucket, keys) => {
    for (const key of keys) objects.delete(key);
    return Promise.resolve({ deleted: keys, errors: [] });
  });

  return { objects };
}
