import { createStorage } from 'unstorage';
import fsDriver from 'unstorage/drivers/fs';

export const cacheStorage = createStorage({
  driver: fsDriver({
    base: './cache',
  }),
});

export default cacheStorage;
