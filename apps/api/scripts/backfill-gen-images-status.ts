// One-off backfill for the imagegen worker-execution migration
// (docs/imagegen/worker-execution-prd.md decision 1): gen_images gained a
// `status` column (default 'pending'), so every row that existed before
// that migration landed on 'pending' regardless of its real state. Under
// the old (pre-worker) model a gen_images row only ever existed once its
// image was uploaded, and media_id was NOT NULL at the time (it's nullable
// now, filled in by the worker on completion), so a non-null media_id on a
// still-'pending' row is unambiguously a pre-existing completed row, never
// a genuinely in-flight new one (those have a null media_id until the
// worker fills them in, belt and suspenders alongside the status guard).
// Without this, old completed images render as pending tiles in the web
// grid and it polls them forever.
//
// Idempotent: the status='pending' guard (backfillCompletedGenImageStatus,
// packages/database/src/repositories/gen-image.repo.ts) means a row already
// flipped to 'completed' is skipped on a re-run, so running this more than
// once is safe.
//
// Lives here rather than packages/database: apps/api already depends on
// @repo/database, so running it from here adds zero new dependency edges
// anywhere in the monorepo (house rule for one-time scripts), same
// reasoning as backfill-media.ts in this same folder. Uses the drizzle
// query builder (via @repo/database's backfillCompletedGenImageStatus)
// rather than hand-written SQL: unlike backfill-media.ts, this migration
// only touches columns the current schema already knows about.
//
// Usage: pnpm --filter @repo/api backfill:gen-images-status

import { backfillCompletedGenImageStatus } from '@repo/database';

async function main(): Promise<void> {
  console.log('Backfilling gen_images.status for pre-existing completed rows...');
  const affected = await backfillCompletedGenImageStatus();

  console.log('\nBackfill summary:');
  console.log(`  gen_images flipped pending -> completed: ${affected}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Backfill failed:', error);
    process.exit(1);
  });
