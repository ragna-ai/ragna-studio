// packages/database/src/index.ts

export * from './db';
export * from './repositories';
export * from './zod';
// Re-exported so consumers (e.g. @repo/testing) never need their own
// drizzle-orm dependency: a second copy at a different version would build
// query fragments (sql``) against a different drizzle-orm than the one this
// package's `db` instance uses, which drizzle doesn't support.
export { sql } from 'drizzle-orm';
