import { embed, embedMany } from 'ai';
import { getEmbeddingModel } from '../factories';

// Fixed constants, not per-agent config:
// a model change means a full re-embed via the backfill
// script, not a live migration, so there is nothing to make configurable.
export const EMBEDDING_PROVIDER = 'openai';
export const EMBEDDING_MODEL_ID = 'text-embedding-3-small';
export const EMBEDDING_DIMENSIONS = 1536;

// ~20k tokens by the chars/4 heuristic, safely under OpenAI's lowest-tier
// 40k TPM per-request ceiling (see the production TPM 429 this batching
// fixes: a whole large document sent as one embedMany call).
const EMBEDDING_MAX_CHARS_PER_BATCH = 80_000;

export async function embedQuery(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: getEmbeddingModel({ provider: EMBEDDING_PROVIDER, model: EMBEDDING_MODEL_ID }),
    value: text,
  });

  return embedding;
}

// Batches so a single request never exceeds OpenAI's TPM cap: chunks are
// ~1.5k chars, so a batch is normally many chunks, but one oversized text
// still gets its own batch rather than being split. Batches run
// sequentially, not in parallel, since the limit is per minute; the AI
// SDK's own retry/backoff handles any 429 between batches.
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const batches = batchByCharBudget(texts, EMBEDDING_MAX_CHARS_PER_BATCH);
  const model = getEmbeddingModel({ provider: EMBEDDING_PROVIDER, model: EMBEDDING_MODEL_ID });

  const embeddings: number[][] = [];
  for (const batch of batches) {
    const result = await embedMany({ model, values: batch });
    embeddings.push(...result.embeddings);
  }

  return embeddings;
}

function batchByCharBudget(texts: string[], maxCharsPerBatch: number): string[][] {
  const batches: string[][] = [];
  let currentBatch: string[] = [];
  let currentChars = 0;

  for (const text of texts) {
    const wouldOverflow = currentBatch.length > 0 && currentChars + text.length > maxCharsPerBatch;

    if (wouldOverflow) {
      batches.push(currentBatch);
      currentBatch = [];
      currentChars = 0;
    }

    currentBatch.push(text);
    currentChars += text.length;
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
}
