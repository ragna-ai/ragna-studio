import { db } from '@repo/database';
import { TEST_SUITE_LOCK_KEY } from '@repo/testing';
import { describe, expect, test } from 'bun:test';

describe('test suite lock', () => {
  test('another session cannot take the lock while a run is active', async () => {
    const otherSession = await db.$client.connect();

    try {
      const result = await otherSession.query<{ locked: boolean }>(
        'select pg_try_advisory_lock($1) as locked',
        [TEST_SUITE_LOCK_KEY],
      );

      expect(result.rows[0]?.locked).toBe(false);
    } finally {
      // Destroy instead of returning it to the pool, so a lock it did take can't leak into later tests.
      otherSession.release(true);
    }
  });
});
