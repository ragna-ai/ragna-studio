<script setup lang="ts">
import { SparklesIcon, Trash2Icon } from '@lucide/vue';
import { Button } from '~/components/ui/button';
import { Spinner } from '~/components/ui/spinner';
import { useDateTimeFormat } from '~/composables/useDateTimeFormat';
import { useDiscardEmailDraft, useGetAllDrafts } from '~/features/email/composables/useEmailDraftApi';
import { formatParticipantList } from '~/features/email/lib/email-display';
import type { EmailDraft } from '~/features/email/types';

// The Drafts folder (docs/email/drafts-change-request.md, section 6): every
// non-terminal draft on the account - user, AI, and ones created in Gmail
// elsewhere - rendered like thread-list rows (recipients/subject/snippet/
// date) rather than the old markdown-preview rows this component used to
// show for the AI-only review queue.
const { t } = useI18n();
const { formatDateTime } = useDateTimeFormat();
const { data, isLoading } = useGetAllDrafts();
const { mutate: discardDraft } = useDiscardEmailDraft();

const drafts = computed(() => data.value?.drafts ?? []);

function recipientsLabel(draft: EmailDraft): string {
  return formatParticipantList(draft.to) || t('email.thread.unknownSender');
}

function snippet(content: string): string {
  const trimmed = content.trim();
  return trimmed.length > 160 ? `${trimmed.slice(0, 160)}…` : trimmed;
}

/** Opens in the thread it belongs to; a `kind: 'new'` draft has none yet, so it gets its own standalone route instead. */
function draftLink(draft: EmailDraft): string {
  return draft.threadId ? `/mail/${draft.threadId}` : `/mail/draft/${draft.id}`;
}
</script>

<template>
  <div v-if="isLoading" class="flex justify-center py-12">
    <Spinner />
  </div>
  <p v-else-if="drafts.length === 0" class="py-12 text-center text-sm text-muted-foreground">
    {{ t('email.draftsFolder.empty') }}
  </p>
  <ul v-else class="mx-auto max-w-2xl divide-y">
    <li v-for="draft in drafts" :key="draft.id" class="flex items-start gap-3 py-4">
      <SparklesIcon v-if="draft.origin === 'ai'" class="mt-0.5 size-4 shrink-0 text-amber-500" />
      <NuxtLinkLocale :to="draftLink(draft)" class="min-w-0 flex-1">
        <div class="flex items-center justify-between gap-2">
          <p class="truncate text-sm font-medium">{{ recipientsLabel(draft) }}</p>
          <span class="shrink-0 text-xs text-muted-foreground">{{ formatDateTime(draft.updatedAt) }}</span>
        </div>
        <p class="truncate text-sm text-muted-foreground">{{ draft.subject || t('email.thread.noSubject') }}</p>
        <p class="mt-0.5 flex items-center gap-2 truncate text-xs text-muted-foreground">
          <span v-if="draft.status === 'generating'" class="rounded-full bg-muted px-2 py-0.5 font-medium">
            {{ t('email.draft.generating') }}
          </span>
          <span v-else>{{ snippet(draft.content) }}</span>
        </p>
      </NuxtLinkLocale>
      <Button
        v-if="draft.status !== 'generating'"
        variant="ghost"
        size="icon"
        :aria-label="t('email.draft.discard')"
        @click="discardDraft({ draftId: draft.id, threadId: draft.threadId })"
      >
        <Trash2Icon class="size-4 text-destructive" />
      </Button>
    </li>
  </ul>
</template>
