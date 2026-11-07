import { agentToolGrantsSchema } from '@repo/ai/client';
import { describe, expect, test } from 'bun:test';

describe('agentToolGrantsSchema', () => {
  test('accepts built-in grants and an integration grant with access', () => {
    const result = agentToolGrantsSchema.safeParse([
      { id: 'think' },
      { id: 'datasets' },
      { id: 'google-drive', access: 'read' },
    ]);
    expect(result.success).toBe(true);
  });

  test('accepts an empty list', () => {
    expect(agentToolGrantsSchema.safeParse([]).success).toBe(true);
  });

  test('rejects two grants for the same tool', () => {
    const result = agentToolGrantsSchema.safeParse([{ id: 'think' }, { id: 'think' }]);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('Duplicate');
  });

  test('rejects an integration grant without access', () => {
    expect(agentToolGrantsSchema.safeParse([{ id: 'google-drive' }]).success).toBe(false);
  });

  test('rejects an integration grant with an unknown access level', () => {
    const grants = [{ id: 'google-drive', access: 'admin' }];
    expect(agentToolGrantsSchema.safeParse(grants).success).toBe(false);
  });

  test('rejects a built-in grant with access', () => {
    expect(agentToolGrantsSchema.safeParse([{ id: 'think', access: 'read' }]).success).toBe(false);
  });

  test('rejects an unknown tool id', () => {
    expect(agentToolGrantsSchema.safeParse([{ id: 'teleport' }]).success).toBe(false);
  });

  test('rejects an extra key', () => {
    const grants = [{ id: 'think', note: 'x' }];
    expect(agentToolGrantsSchema.safeParse(grants).success).toBe(false);
  });
});
