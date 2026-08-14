<script setup lang="ts">
import { ArchiveIcon, CornerUpLeftIcon, ForwardIcon, MailIcon, MailOpenIcon, StarIcon, Trash2Icon } from '@lucide/vue';
import { Button } from '~/components/ui/button';
import { Separator } from '~/components/ui/separator';
import { Spinner } from '~/components/ui/spinner';
import EmailCategoryBadge from '~/features/email/components/EmailCategoryBadge.vue';
import EmailComposeDialog from '~/features/email/components/EmailComposeDialog.vue';
import EmailDraftPanel from '~/features/email/components/EmailDraftPanel.vue';
import EmailDraftTriggerButton from '~/features/email/components/EmailDraftTriggerButton.vue';
import EmailMessageItem from '~/features/email/components/EmailMessageItem.vue';
import { useGetEmailAccount } from '~/features/email/composables/useEmailAccountApi';
import { useGetEmailCategories } from '~/features/email/composables/useEmailCategoryApi';
import { useGetThreadDrafts } from '~/features/email/composables/useEmailDraftApi';
import {
  useGetEmailThread,
  useSetThreadArchived,
  useSetThreadRead,
  useSetThreadStarred,
  useSetThreadTrashed,
} from '~/features/email/composables/useEmailThreadApi';
import { buildForwardSubject, buildInitialReplyContent, buildReplySubject } from '~/features/email/lib/email-reply-quote';
import type { EmailMessageDetail, EmailThreadListFilters } from '~/features/email/types';

// Props
const props = defineProps<{
  threadId: string;
  filters: EmailThreadListFilters;
}>();

// Composables
const { t } = useI18n();
const router = useRouter();
const threadIdRef = computed(() => props.threadId);
const filtersRef = computed(() => props.filters);
const { data, isLoading, isError } = useGetEmailThread(threadIdRef);
const { data: draftsData } = useGetThreadDrafts(threadIdRef);
const { data: accountData } = useGetEmailAccount();
const { data: categoriesData } = useGetEmailCategories();
const { mutate: archiveThread } = useSetThreadArchived(filtersRef);
const { mutate: trashThread } = useSetThreadTrashed(filtersRef);
const { mutate: starThread } = useSetThreadStarred(filtersRef);
const { mutate: setThreadRead } = useSetThreadRead();

// Refs
const expandedIds = ref<Set<string>>(new Set());
// Guards the mark-read-on-open watcher below: the id of the thread it has
// already fired for, so it runs exactly once per open (see the watcher).
const markedReadThreadId = ref<string | null>(null);
type ComposeMode = 'reply' | 'replyAll' | 'forward';
const composeState = ref<{ mode: ComposeMode; message: EmailMessageDetail } | null>(null);
const isComposeOpen = computed({
  get: () => composeState.value !== null,
  set: (value) => {
    if (!value) composeState.value = null;
  },
});

// Computed
const thread = computed(() => data.value?.thread ?? null);
const messages = computed(() => data.value?.messages ?? []);
const category = computed(() => categoriesData.value?.categories.find((c) => c.id === thread.value?.categoryId) ?? null);
const lastMessage = computed(() => messages.value.at(-1) ?? null);
const activeDraft = computed(
  () => draftsData.value?.drafts.find((draft) => draft.status === 'generating' || draft.status === 'ready') ?? null,
);
const draftReplyToMessage = computed(
  () => messages.value.find((message) => message.id === activeDraft.value?.replyToMessageId) ?? null,
);
const canReplyAll = computed(() => (lastMessage.value?.cc.length ?? 0) > 0);

const composeTitle = computed(() => {
  if (!composeState.value) return '';
  return composeState.value.mode === 'forward' ? t('email.message.forward') : t('email.message.reply');
});
const composeInitialTo = computed(() => {
  if (!composeState.value || composeState.value.mode === 'forward') return [];
  return [composeState.value.message.from.email];
});
const composeInitialCc = computed(() => {
  if (composeState.value?.mode !== 'replyAll') return [];
  return composeState.value.message.cc.map((participant) => participant.email);
});
const composeSubject = computed(() => {
  if (!composeState.value) return '';
  return composeState.value.mode === 'forward'
    ? buildForwardSubject(thread.value?.subject ?? null)
    : buildReplySubject(thread.value?.subject ?? null);
});
const composeContent = computed(() =>
  composeState.value ? buildInitialReplyContent(composeState.value.message) : '',
);

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

watch(
  lastMessage,
  (message) => {
    if (message && expandedIds.value.size === 0) {
      expandedIds.value = new Set([message.id]);
    }
  },
  { immediate: true },
);

// Opening a thread marks it read (docs/email/prd.md), fired here as an
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

// Reply/Reply all/Forward live in the top bar (not per-message) and always
// target the latest message - the same message the composer already
// threads a reply against (replyToMessageId), so there's only ever one
// "reply" concept for a thread rather than one per message row.
function openComposeFromLastMessage(mode: ComposeMode) {
  if (!lastMessage.value) return;
  composeState.value = { mode, message: lastMessage.value };
}

function handleSent() {
  composeState.value = null;
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
  trashThread({ threadId: thread.value.id });
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
      <header class="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <h2 class="truncate text-base font-semibold">{{ thread.subject || t('email.thread.noSubject') }}</h2>
            <EmailCategoryBadge v-if="category" :category="category" />
          </div>
        </div>
        <div class="flex shrink-0 items-center gap-1">
          <Button v-if="lastMessage" variant="outline" size="sm" @click="openComposeFromLastMessage('reply')">
            <CornerUpLeftIcon class="mr-2 size-3.5" />
            {{ t('email.message.reply') }}
          </Button>
          <Button v-if="canReplyAll" variant="outline" size="sm" @click="openComposeFromLastMessage('replyAll')">
            {{ t('email.message.replyAll') }}
          </Button>
          <Button v-if="lastMessage" variant="outline" size="sm" @click="openComposeFromLastMessage('forward')">
            <ForwardIcon class="mr-2 size-3.5" />
            {{ t('email.message.forward') }}
          </Button>
          <EmailDraftTriggerButton
            v-if="lastMessage && !activeDraft"
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
            :aria-label="t('email.thread.actions.trash')"
            @click="handleTrash"
          >
            <Trash2Icon class="size-4" />
          </Button>
        </div>
      </header>

      <div class="min-h-0 flex-1 overflow-y-auto">
        <EmailDraftPanel
          v-if="activeDraft"
          :draft="activeDraft"
          :reply-to-message="draftReplyToMessage"
          :thread-subject="thread.subject"
          @sent="handleSent"
        />
        <EmailMessageItem
          v-for="message in messages"
          :key="message.id"
          :message="message"
          :expanded="isExpanded(message.id)"
          @toggle-expand="toggleExpanded(message.id)"
        />
      </div>
    </template>

    <EmailComposeDialog
      v-model:open="isComposeOpen"
      :title="composeTitle"
      :initial-to="composeInitialTo"
      :initial-cc="composeInitialCc"
      :subject="composeSubject"
      :content="composeContent"
      :thread-id="composeState?.mode !== 'forward' ? thread?.id : undefined"
      :reply-to-message-id="composeState?.mode !== 'forward' ? composeState?.message.id : undefined"
      @sent="handleSent"
    />
  </div>
</template>
