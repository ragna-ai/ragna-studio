import * as z from 'zod';

// Strict tool-call schemas (e.g. OpenAI's) require every key present, and
// only support omission via an explicit null, not true optionality — hence
// .nullable(). The '' fallback covers models that send it anyway.
export function optionalNonEmptyString() {
  return z
    .string()
    .nullish()
    .transform((value) => value || undefined);
}
