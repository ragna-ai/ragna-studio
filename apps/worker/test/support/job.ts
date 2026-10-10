import type { ProcessorJob } from '@repo/queue';

export interface BuildJobParams {
  name: string;
  data: unknown;
  attempts?: number;
  attemptsMade?: number;
}

/** Minimal BullMQ job for calling a processor handler directly. */
export function buildJob({ name, data, attempts, attemptsMade = 0 }: BuildJobParams): ProcessorJob {
  return {
    id: `test-job-${crypto.randomUUID()}`,
    name,
    data,
    opts: { attempts },
    attemptsMade,
  };
}
