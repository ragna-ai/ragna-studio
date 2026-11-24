import { describe, expect, test } from 'bun:test';
import { isAgentStuck } from '../../src/task-runs/task-run-guards';

const USAGE = { inputTokens: 1, outputTokens: 1, totalTokens: 2 };

function traceOf(...inputs: unknown[]) {
  return inputs.map((input) => ({
    usage: USAGE,
    toolCalls: [{ toolName: 'memory', input, output: null }],
  }));
}

describe('stuck detection', () => {
  test('treats the same input with its keys in another order as the same call', () => {
    const trace = traceOf({ a: 1, b: 2 }, { b: 2, a: 1 }, { a: 1, b: 2 });
    expect(isAgentStuck(trace)).toBe(true);
  });

  test('is not stuck after only two equal calls', () => {
    expect(isAgentStuck(traceOf({ a: 1 }, { a: 1 }))).toBe(false);
  });

  test('is not stuck when one of the last three inputs differs', () => {
    expect(isAgentStuck(traceOf({ a: 1 }, { a: 2 }, { a: 1 }))).toBe(false);
  });
});
