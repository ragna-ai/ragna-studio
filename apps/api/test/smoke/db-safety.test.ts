import { getConnectedDatabaseName } from '@repo/testing';
import { describe, expect, test } from 'bun:test';

// This is the load-bearing test for the whole suite: every other test file
// truncates tables between tests. If the bunfig.toml preload ever stopped
// overriding DB_DATABASE, that truncation would silently start hitting the
// dev database instead of studio_test.
describe('test database safety', () => {
  test('the API connects to the dedicated test database, never the dev one', async () => {
    const { name } = await getConnectedDatabaseName();

    expect(name).toBe('studio_test');
  });
});
