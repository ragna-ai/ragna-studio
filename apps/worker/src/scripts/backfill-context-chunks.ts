// One-off backfill for the chunk table (docs/agent/agent-context-retrieval.md,
// "Migration / backfill"). Existing `ready` documents predate the chunk
// table and have no chunks. Re-enqueues the existing extraction job for
// every non-`pending` document: R2 objects persist, extraction is
// idempotent, and the extended pipeline produces the chunks. Documents
// briefly go `pending` and drop out of prompts while the job runs.
//
// This is also the re-embed path if the embedding model ever changes.
//
// Run manually (no dedicated package script/dependency): from the repo root,
//   pnpm dlx tsx apps/worker/src/scripts/backfill-context-chunks.ts

import { getNonPendingAgentContextDocumentIds } from '@repo/database';
import { EXTRACT_AGENT_CONTEXT_DOCUMENT_JOB, ExtractAgentContextDocumentJobDto, queue } from '@repo/queue';

async function main(): Promise<void> {
  const documentIds = await getNonPendingAgentContextDocumentIds();

  for (const documentId of documentIds) {
    await queue
      .agentContextDocument()
      .add(EXTRACT_AGENT_CONTEXT_DOCUMENT_JOB, new ExtractAgentContextDocumentJobDto({ documentId }).toJSON());
  }

  console.log(`Enqueued extraction for ${documentIds.length} document(s).`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Backfill failed:', error);
    process.exit(1);
  });
