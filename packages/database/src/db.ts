import { config } from '@repo/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { relations } from './schema/relations';

const db = drizzle({
  connection: {
    connectionString: config.getSecret('DATABASE_URL'),
    ssl: false,
  },
  relations,
});

export { db };
