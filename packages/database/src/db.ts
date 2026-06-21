import { config } from '@repo/config';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

const sqlite = new Database(config.getSecret('DATABASE_URL'));
const db = drizzle({ client: sqlite, schema });

export { db };
