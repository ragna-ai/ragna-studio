import { ref } from 'vue';
import type { EmailAccountSyncState } from '~/features/email/types';

// Coordinates the account query's forced polling window after a manual
// "Sync now" trigger (useEmailAccountApi.ts). Plain module-level state for
// the poll bookkeeping, not refs: it's only read/written from
// `refetchInterval`'s plain (non-reactive) callback, and a module singleton
// avoids threading shared state between useSyncEmailAccount and
// useGetEmailAccount, which may be called from unrelated components. A
// single `ref` is kept alongside it (updated at the same points) purely so
// the UI can reactively spin/disable the "Sync now" button for the whole
// job lifetime, not just the (usually-shorter) window where the cached
// syncState happens to literally read 'syncing'.
//
// Two races this exists for:
// - POST /email/account/sync's 202 response carries the *enqueue-time*
//   syncState (email-api's note - the worker hasn't picked the job up
//   yet), which is often still 'idle' from a previous sync. Without a
//   forced window, useGetEmailAccount's plain "poll while cached state is
//   'syncing'" never engages, so the syncing -> settled transition is
//   never observed and the button looks like it did nothing.
// - A *fast* sync can finish entirely between two 3s poll ticks, so
//   'syncing' is never observed either - the completion has to be
//   detected another way: `lastSyncedAt` moving past the pre-sync
//   baseline, which the worker only bumps on a successful sync. A failed
//   sync doesn't move it, but that path is still caught by the
//   observed-transition or hard-stop checks below.

const FORCE_POLL_WINDOW_MS = 60_000;
const FORCE_POLL_INTERVAL_MS = 3000;

let forcePollDeadline = 0;
let hasObservedSyncing = false;
let baselineLastSyncedAt: string | null = null;

/** Reactive mirror of "is a manually-triggered sync still in flight (or presumed to be)": spans trigger to observed settle, or the 60s hard-stop, whichever comes first. */
export const isManualAccountSyncActive = ref(false);

/**
 * Called right after a successful "Sync now" trigger. `lastSyncedAt` is the
 * account's pre-sync value (the 202 response's own `lastSyncedAt`, an
 * enqueue-time snapshot that hasn't moved yet) - the baseline this compares
 * future polls against to detect a fast sync finishing between ticks.
 */
export function startAccountSyncForcePoll(lastSyncedAt: string | null): void {
  forcePollDeadline = Date.now() + FORCE_POLL_WINDOW_MS;
  hasObservedSyncing = false;
  baselineLastSyncedAt = lastSyncedAt;
  isManualAccountSyncActive.value = true;
}

function closeForcePollWindow(): void {
  forcePollDeadline = 0;
  isManualAccountSyncActive.value = false;
}

/**
 * `refetchInterval` callback for useGetEmailAccount: keeps polling while a
 * sync is actually in flight (covers cron-triggered syncs too, unchanged),
 * or while inside the forced window opened by a manual trigger. Closes the
 * window - and flips `isManualAccountSyncActive` back off - as soon as any
 * of: a full syncing -> settled transition was observed, `lastSyncedAt`
 * moved past the pre-trigger baseline (a fast sync completed between poll
 * ticks), or the 60s hard-stop is reached.
 */
export function accountSyncRefetchIntervalMs(
  syncState: EmailAccountSyncState | undefined,
  lastSyncedAt: string | null | undefined,
): number | false {
  if (syncState === 'syncing') {
    hasObservedSyncing = true;
    return FORCE_POLL_INTERVAL_MS;
  }

  const windowOpen = isManualAccountSyncActive.value;
  const lastSyncedAtAdvanced = windowOpen && lastSyncedAt !== undefined && lastSyncedAt !== baselineLastSyncedAt;

  if (hasObservedSyncing || lastSyncedAtAdvanced) {
    closeForcePollWindow();
    return false;
  }

  if (windowOpen && Date.now() < forcePollDeadline) {
    return FORCE_POLL_INTERVAL_MS;
  }

  if (windowOpen) {
    closeForcePollWindow(); // Hard-stop: window expired without a detected completion.
  }
  return false;
}
