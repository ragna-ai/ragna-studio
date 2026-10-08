<script setup lang="ts">
import { ArchiveIcon, CornerUpLeftIcon, ForwardIcon, MailIcon, MailOpenIcon, StarIcon, Trash2Icon, TrashIcon } from '@lucide/vue';
import { Button } from '~/components/ui/button';
import { Separator } from '~/components/ui/separator';
import { Spinner } from '~/components/ui/spinner';
import EmailDraftPanel from '~/features/email/components/EmailDraftPanel.vue';
import EmailDraftTriggerButton from '~/features/email/components/EmailDraftTriggerButton.vue';
import EmailMessageItem from '~/features/email/components/EmailMessageItem.vue';
import { useGetEmailAccount } from '~/features/email/composables/useEmailAccountApi';
import { useGetEmailCategories } from '~/features/email/composables/useEmailCategoryApi';
import {
  extractConflictingDraft,
  useCreateEmailDraft,
  useDiscardEmailDraft,
  useGetThreadDrafts,
  useIsDraftTriggerPending,
  useUpdateEmailDraft,
} from '~/features/email/composables/useEmailDraftApi';
import {
  useGetEmailThread,
  useSetThreadArchived,
  useSetThreadRead,
  useSetThreadStarred,
  useSetThreadTrashed,
} from '~/features/email/composables/useEmailThreadApi';
import type { EmailCategory, EmailDraftKind, EmailMessageDetail, EmailThreadListFilters } from '~/features/email/types';

// Props
const props = defineProps<{
  threadId: string;
  filters: EmailThreadListFilters;
}>();

// Composables
const { t } = useI18n();
const router = useRouter();
const { confirm } = useConfirmDialog();
const threadIdRef = computed(() => props.threadId);
const filtersRef = computed(() => props.filters);
const { data, isLoading, isError } = useGetEmailThread(threadIdRef);
const { data: draftsData } = useGetThreadDrafts(threadIdRef);
const isDraftTriggerPending = useIsDraftTriggerPending(threadIdRef);
const { data: accountData } = useGetEmailAccount();
const { data: categoriesData } = useGetEmailCategories();
const { mutate: archiveThread } = useSetThreadArchived(filtersRef);
const { mutate: trashThread } = useSetThreadTrashed(filtersRef);
const { mutate: starThread } = useSetThreadStarred(filtersRef);
const { mutate: setThreadRead } = useSetThreadRead();
const { mutateAsync: createDraft } = useCreateEmailDraft();
const { mutateAsync: updateDraft } = useUpdateEmailDraft();
const { mutateAsync: discardDraft } = useDiscardEmailDraft();

// Refs
const expandedIds = ref<Set<string>>(new Set());
// Guards the mark-read-on-open watcher below: the id of the thread it has
// already fired for, so it runs exactly once per open (see the watcher).
const markedReadThreadId = ref<string | null>(null);
const isStartingDraft = ref(false);
const draftPanel = useTemplateRef<InstanceType<typeof EmailDraftPanel>>('draftPanel');

// Computed
const thread = computed(() => data.value?.thread ?? null);
// API returns messages oldest-first (sentAt asc) so lastMessage/reply-target
// logic below keeps reading .at(-1) - only the render order is flipped
// (newest-first, macOS Mail-style) via messagesNewestFirst.
const messages = computed(() => data.value?.messages ?? []);
const messagesNewestFirst = computed(() => [...messages.value].reverse());
const categoryById = computed(() => new Map(categoriesData.value?.categories.map((category) => [category.id, category]) ?? []));
const lastMessage = computed(() => messages.value.at(-1) ?? null);

function categoryFor(message: EmailMessageDetail): EmailCategory | null {
  return message.categoryId ? (categoryById.value.get(message.categoryId) ?? null) : null;
}
// One active (non-terminal) draft per thread, whoever wrote it - AI or user.
// Never needed an origin filter here in the first place since
// `GET /email/draft?threadId=` now already returns both.
const activeDraft = computed(
  () => draftsData.value?.drafts.find((draft) => draft.status === 'generating' || draft.status === 'ready') ?? null,
);
const canReplyAll = computed(() => (lastMessage.value?.cc.length ?? 0) > 0);

// Functions
function isExpanded(messageId: string): boolean {
  return expandedIds.value.has(messageId);
}

function toggleExpanded(messageId: string) {
  const next = new Set(expandedIds.value);
  if (next.has(messageId)) {
    next.delete(messageId);
  } else {
    next.add(messageId);
  }
  expandedIds.value = next;
}

// The view now stays mounted across thread switches (pages/mail/[[threadId]].vue's
// `key: false`), so expandedIds no longer resets for free between threads -
// clear it explicitly whenever the open thread changes, before the lastMessage
// watcher below re-expands the new thread's latest message.
watch(
  () => props.threadId,
  () => {
    expandedIds.value = new Set();
  },
);

watch(
  lastMessage,
  (message) => {
    if (message && expandedIds.value.size === 0) {
      expandedIds.value = new Set([message.id]);
    }
  },
  { immediate: true },
);

// Opening a thread marks it read, fired here as an
// explicit action rather than a GET side effect (that was tried and
// reverted: it made every refetch non-idempotent). Guarded by
// markedReadThreadId so this runs exactly once per thread *becoming the
// one shown here*, not on every reactive update of `thread` - firing again
// whenever `thread.isUnread` flips (e.g. from the explicit toggle below, or
// from patches other actions apply) would immediately re-mark-read a thread
// the user just explicitly marked unread, right back to the original bug.
watch(
  thread,
  (value) => {
    if (!value || markedReadThreadId.value === value.id) return;
    markedReadThreadId.value = value.id;
    if (value.isUnread) {
      setThreadRead({ threadId: value.id, read: true });
    }
  },
  { immediate: true },
);

async function focusExistingDraft() {
  await nextTick();
  draftPanel.value?.scrollIntoView();
}

// Reply/Reply all/Forward live in the top bar (not per-message) and always
// target the latest message - the same message the composer already
// threads a reply against (replyToMessageId), so there's only ever one
// "reply" concept for a thread rather than one per message row.
//
// One active draft per thread:
// if one already exists and matches `kind`, focus it instead of opening
// a second one; if it's a different kind, confirm discarding it first.
// `includeAllRecipients` is Reply all's only distinguishing behaviour -
// `POST /email/draft`'s body has no field for it (just `kind`/`threadId`/
// `replyToMessageId`), so a plain Reply and Reply all both create a
// `kind: 'reply'` draft and this seeds the extra recipients into `cc` with
// a follow-up PATCH once the row exists. JUDGEMENT CALL: flagged for the API
// agent - if `kind: 'reply'` sees a different default `to`/`cc` seed than a
// plain reply, this two-step dance is the only way the client can ask for
// "reply all" specifically.
async function startCompose(kind: EmailDraftKind, options: { includeAllRecipients?: boolean } = {}) {
  if (!lastMessage.value || !thread.value || isStartingDraft.value) return;

  if (activeDraft.value) {
    if (activeDraft.value.kind === kind) {
      await focusExistingDraft();
      return;
    }
    const confirmed = await confirm({
      title: t('email.thread.replaceDraft.title'),
      message: t('email.thread.replaceDraft.message'),
      confirmLabel: t('email.draft.discard'),
      cancelLabel: t('common.cancel'),
      variant: 'destructive',
    });
    if (!confirmed) return;
    await discardDraft({ draftId: activeDraft.value.id, threadId: activeDraft.value.threadId });
  }

  isStartingDraft.value = true;
  try {
    const { draft } = await createDraft({
      kind,
      threadId: thread.value.id,
      replyToMessageId: lastMessage.value.id,
    });
    if (options.includeAllRecipients && draft.cc.length === 0 && lastMessage.value.cc.length > 0) {
      await updateDraft({ draftId: draft.id, threadId: draft.threadId, cc: lastMessage.value.cc });
    }
  } catch (error) {
    // Someone else created a draft on this thread between the check above
    // and this request landing (the 409 one-active-draft-per-thread rule) -
    // focus that one instead of surfacing an error.
    if (extractConflictingDraft(error)) await focusExistingDraft();
  } finally {
    isStartingDraft.value = false;
  }
}

function backToList() {
  router.push({ path: '/mail', query: { ...router.currentRoute.value.query } });
}

function handleArchive() {
  if (!thread.value) return;
  archiveThread({ threadId: thread.value.id, archived: true });
  backToList();
}

function handleTrash() {
  if (!thread.value) return;
  const trashed = props.filters.folder !== 'trashed';
  trashThread({ threadId: thread.value.id, trashed });
  backToList();
}

// `read` and `isUnread` are opposites of the same flag: the target `read`
// value to send is the thread's *current* `isUnread` (not its negation) -
// isUnread=true means "send read=true" to flip it read. Marking unread just
// works now that GET is a pure read again: nothing re-fetches this thread
// on its own, and even if something did, a refetch can no longer flip it
// back (see the mark-read-on-open watcher above, guarded per thread id).
function handleToggleRead() {
  if (!thread.value) return;
  setThreadRead({ threadId: thread.value.id, read: thread.value.isUnread });
}
</script>

<template>
  <div class="flex h-full min-w-0 flex-1 flex-col">
    <div v-if="isLoading" class="flex flex-1 items-center justify-center">
      <Spinner />
    </div>
    <p v-else-if="isError" class="flex flex-1 items-center justify-center text-sm text-destructive">
      {{ t('email.thread.loadError') }}
    </p>
    <template v-else-if="thread">
      <header class="flex shrink-0 items-center justify-end gap-3 border-b px-4 py-3">
        <div class="flex shrink-0 items-center gap-1">
          <Button
            v-if="lastMessage"
            variant="outline"
            size="sm"
            :disabled="isStartingDraft"
            @click="startCompose('reply')"
          >
            <CornerUpLeftIcon class="mr-2 size-3.5" />
            {{ t('email.message.reply') }}
          </Button>
          <Button
            v-if="canReplyAll"
            variant="outline"
            size="sm"
            :disabled="isStartingDraft"
            @click="startCompose('reply', { includeAllRecipients: true })"
          >
            {{ t('email.message.replyAll') }}
          </Button>
          <Button
            v-if="lastMessage"
            variant="outline"
            size="sm"
            :disabled="isStartingDraft"
            @click="startCompose('forward')"
          >
            <ForwardIcon class="mr-2 size-3.5" />
            {{ t('email.message.forward') }}
          </Button>
          <EmailDraftTriggerButton
            v-if="lastMessage && !activeDraft && !isDraftTriggerPending"
            :thread-id="thread.id"
            :reply-to-message-id="lastMessage.id"
            :default-agent-id="accountData?.account?.defaultAgentId ?? null"
          />

          <Separator orientation="vertical" class="mx-1 h-5" />

          <Button
            variant="ghost"
            size="icon"
            :aria-label="t('email.thread.actions.toggleStar')"
            @click="starThread({ threadId: thread.id, starred: !thread.isStarred })"
          >
            <StarIcon class="size-4" :class="{ 'fill-amber-400 text-amber-400': thread.isStarred }" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            :aria-label="t('email.thread.actions.toggleRead')"
            @click="handleToggleRead"
          >
            <!-- In-thread feedback for the toggle, same idea as the star
                 fill above: closed envelope while unread (click to mark
                 read), open envelope once read (click to mark unread) -
                 otherwise clicking this gave no visible sign it did
                 anything while staying on this thread. -->
            <MailIcon v-if="thread.isUnread" class="size-4" />
            <MailOpenIcon v-else class="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            :aria-label="t('email.thread.actions.archive')"
            @click="handleArchive"
          >
            <ArchiveIcon class="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            class="group/trash"
            :aria-label="
              props.filters.folder === 'trashed'
                ? t('email.thread.actions.restore')
                : t('email.thread.actions.trash')
            "
            @click="handleTrash"
          >
            <TrashIcon
              v-if="props.filters.folder === 'trashed'"
              class="size-4 group-hover/trash:text-green-600"
            />
            <Trash2Icon v-else class="size-4" />
          </Button>
        </div>
      </header>

      <div class="min-h-0 flex-1 overflow-y-auto">
        <EmailDraftPanel v-if="activeDraft" ref="draftPanel" :draft="activeDraft" />
        <!-- The trigger's server-side row (which EmailDraftPanel's own
             'generating' state renders off) only exists once the worker
             picks the job up - this covers the gap between the click and
             that row showing up, so "Draft with AI" gives feedback right
             away instead of appearing to do nothing. -->
        <div
          v-else-if="isDraftTriggerPending"
          class="flex items-center gap-2 border-b bg-amber-50/50 px-4 py-4 text-sm text-muted-foreground"
        >
          <Spinner class="size-4" />
          {{ t('email.draft.generating') }}
        </div>
        <EmailMessageItem
          v-for="message in messagesNewestFirst"
          :key="message.id"
          :message="message"
          :category="categoryFor(message)"
          :expanded="isExpanded(message.id)"
          @toggle-expand="toggleExpanded(message.id)"
        />
      </div>
    </template>
  </div>
</template>
