// file: errors.ts

import { DrizzleQueryError } from 'drizzle-orm';

// Postgres' unique_violation code.
const POSTGRES_UNIQUE_VIOLATION_CODE = '23505';

/**
 * True if `error` is a unique-constraint violation surfaced through
 * drizzle. node-postgres throws a `DatabaseError` with `code: '23505'`;
 * drizzle wraps every driver error in `DrizzleQueryError` and attaches the
 * original as `.cause` rather than re-exposing `code` on the wrapper
 * itself, so a plain `'code' in error` check on the caught error never
 * matches.
 *
 * Exported here (instead of callers importing `drizzle-orm` and doing their
 * own `instanceof DrizzleQueryError` check) so that check always runs
 * against the same `DrizzleQueryError` class this package's own `db`
 * instance throws with. A second copy of `drizzle-orm` resolved into a
 * caller's own dependency tree would be a different class reference and
 * `instanceof` would silently never match - the same hazard the `sql`
 * re-export in index.ts guards against.
 */
export function isUniqueViolationError(error: unknown): boolean {
  if (!(error instanceof DrizzleQueryError)) {
    return false;
  }

  const cause = error.cause;
  if (typeof cause !== 'object' || cause === null || !('code' in cause)) {
    return false;
  }

  return cause.code === POSTGRES_UNIQUE_VIOLATION_CODE;
}

// Postgres' foreign_key_violation code.
const POSTGRES_FOREIGN_KEY_VIOLATION_CODE = '23503';

export type ForeignReferenceResource = 'agent' | 'taskLabel' | 'folder' | 'dataset';

/** User-facing name per resource, for "<Label> not found" messages. */
export const FOREIGN_REFERENCE_RESOURCE_LABEL: Readonly<Record<ForeignReferenceResource, string>> =
  {
    agent: 'Agent',
    taskLabel: 'Label',
    folder: 'Folder',
    dataset: 'Dataset',
  };

interface ForeignReferenceErrorOptions {
  resource: ForeignReferenceResource;
  ids: string[];
}

/** Thrown before a write when referenced ids do not exist in the target workspace. */
export class ForeignReferenceError extends Error {
  readonly resource: ForeignReferenceResource;
  readonly ids: string[];

  constructor({ resource, ids }: ForeignReferenceErrorOptions) {
    super(`${FOREIGN_REFERENCE_RESOURCE_LABEL[resource]} not found: ${ids.join(', ')}`);
    this.name = 'ForeignReferenceError';
    this.resource = resource;
    this.ids = ids;
  }
}

const FOREIGN_REFERENCE_RESOURCE_BY_CONSTRAINT: Readonly<Record<string, ForeignReferenceResource>> =
  {
    tasks_assigned_agent_workspace_fk: 'agent',
    tasks_to_task_labels_label_workspace_fk: 'taskLabel',
    documents_folder_workspace_fk: 'folder',
    agents_default_dataset_workspace_fk: 'dataset',
  };

/**
 * The resource a rejected cross-workspace reference points at, or `null` when
 * `error` is not a foreign-key violation on one of the workspace-scoped
 * composite constraints. Unwraps `DrizzleQueryError` here for the same
 * `instanceof` reason as `isUniqueViolationError`.
 */
export function getForeignReferenceResource(error: unknown): ForeignReferenceResource | null {
  if (error instanceof ForeignReferenceError) {
    return error.resource;
  }
  if (!(error instanceof DrizzleQueryError)) {
    return null;
  }

  const cause = error.cause;
  if (typeof cause !== 'object' || cause === null) {
    return null;
  }
  if (!('code' in cause) || cause.code !== POSTGRES_FOREIGN_KEY_VIOLATION_CODE) {
    return null;
  }
  if (!('constraint' in cause) || typeof cause.constraint !== 'string') {
    return null;
  }

  return FOREIGN_REFERENCE_RESOURCE_BY_CONSTRAINT[cause.constraint] ?? null;
}
