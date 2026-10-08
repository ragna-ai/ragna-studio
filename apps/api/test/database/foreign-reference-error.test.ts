import { db, getForeignReferenceResource, sql } from '@repo/database';
import { truncateAllTables } from '@repo/testing';
import { beforeEach, describe, expect, test } from 'bun:test';

// The mapped constraints are exercised end to end by the
// workspace-references tests in test/task, test/document and test/agent.

describe('getForeignReferenceResource', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  test('returns null for a non-foreign-key database error', async () => {
    const error = await db.execute(sql`select 1 / 0`).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect(getForeignReferenceResource(error)).toBeNull();
  });

  test('returns null for a foreign-key violation on an unmapped constraint', async () => {
    const error = await db
      .execute(
        sql`insert into tasks_to_task_labels (workspace_id, task_id, task_label_id) values ('w', 't', 'l')`,
      )
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect(getForeignReferenceResource(error)).toBeNull();
  });

  test('returns null for a value that is not an error', () => {
    expect(getForeignReferenceResource('boom')).toBeNull();
  });
});
