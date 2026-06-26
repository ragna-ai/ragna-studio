import { config } from '@repo/config';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema';

const db = drizzle({ connection: { url: config.getSecret('DATABASE_URL') }, schema });

export { db };
