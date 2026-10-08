import type { EmailThreadListFilters } from '~/features/email/types';

/**
 * Query keys for the whole email feature, gathered in one place (task/agent
 * feature convention) so invalidation call sites never hand-roll a key that
 * silently drifts from the one a query actually used.
 */
export const emailKeys = {
  account: () => ['email', 'account'] as const,
  categories: () => ['email', 'categories'] as const,
  autoDraftSenders: () => ['email', 'auto-draft-senders'] as const,
  // `filters` is a Ref: vue-query deeply unrefs queryKey elements, so
  // passing the ref itself (rather than its resolved fields) keeps this key
  // reactive without a wrapping `computed()` at every call site.
  threads: (filters: MaybeRefOrGetter<EmailThreadListFilters>) =>
    ['email', 'threads', filters] as const,
  // Nullable: these back queries that stay `enabled: false` (and so never
  // actually fetch) until their id resolves - typed to match rather than
  // cast to a non-null type at every call site.
  thread: (threadId: MaybeRefOrGetter<string | null>) =>
    ['email', 'thread', threadId] as const,
  search: (query: MaybeRefOrGetter<string>) =>
    ['email', 'search', query] as const,
  drafts: (threadId: MaybeRefOrGetter<string | null>) =>
    ['email', 'drafts', threadId] as const,
  // Singular: one draft by id, for the standalone `/mail/draft/:draftId`
  // view. Distinct key from the plural `drafts(threadId)` above.
  draft: (draftId: MaybeRefOrGetter<string | null>) =>
    ['email', 'draft', draftId] as const,
  // Every non-terminal draft on the account (`GET /email/draft` with no
  // `threadId`): backs the Drafts pseudo-folder and the thread-row indicator.
  allDrafts: () => ['email', 'drafts', 'all'] as const,
  attachments: (messageId: MaybeRefOrGetter<string>) =>
    ['email', 'attachments', messageId] as const,
};
