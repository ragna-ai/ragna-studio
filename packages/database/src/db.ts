import { config } from '@repo/config';
import { drizzle } from 'drizzle-orm/libsql';
import { relations } from './schema/relations';

const db = drizzle(config.getSecret('DATABASE_URL'), { relations });

export { db };
