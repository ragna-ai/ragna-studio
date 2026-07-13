import type { Executor } from './types';

// The trigger node has no incoming edges; its output is the run's input.
export const executeTrigger: Executor = async (_node, ctx) => ({ output: ctx.input });
