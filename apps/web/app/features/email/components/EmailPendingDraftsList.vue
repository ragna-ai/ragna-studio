<script setup lang="ts">
import { SparklesIcon, Trash2Icon } from '@lucide/vue';
import { Button } from '~/components/ui/button';
import { Spinner } from '~/components/ui/spinner';
import { useDateTimeFormat } from '~/composables/useDateTimeFormat';
import { useDiscardEmailDraft, useGetPendingDrafts } from '~/features/email/composables/useEmailDraftApi';

// Review inbox for GET /email/draft/pending (docs/email/prd.md): drafts
// carry no subject/participants of their own (email_drafts row only has
// thread/message refs + markdown content), so each row previews the
// markdown itself and links into the thread, where EmailDraftPanel.vue
// renders the full review/edit/send/discard flow.
const { t } = useI18n();
const { formatDateTime } = useDateTimeFormat();
const { data, isLoading } = useGetPendingDrafts();
const { mutate: discardDraft } = useDiscardEmailDraft();

const drafts = computed(() => data.value?.drafts ?? []);

function preview(content: string): string {
  const trimmed = content.trim();
  return trimmed.length > 160 ? `${trimmed.slice(0, 160)}…` : trimmed;
}
</script>

<template>
  <div v-if="isLoading" class="flex justify-center py-12">
    <Spinner />
  </div>
  <p v-else-if="drafts.length === 0" class="py-12 text-center text-sm text-muted-foreground">
    {{ t('email.pendingDrafts.empty') }}
  </p>
  <ul v-else class="mx-auto max-w-2xl divide-y">
    <li v-for="draft in drafts" :key="draft.id" class="flex items-start gap-3 py-4">
      <SparklesIcon class="mt-0.5 size-4 shrink-0 text-amber-500" />
      <NuxtLinkLocale :to="`/mail/${draft.threadId}`" class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <span
            class="rounded-full px-2 py-0.5 text-xs font-medium"
            :class="draft.status === 'generating' ? 'bg-muted text-muted-foreground' : 'bg-amber-100 text-amber-700'"
          >
            {{ draft.status === 'generating' ? t('email.draft.generating') : t('email.draft.readyBadge') }}
          </span>
          <span class="text-xs text-muted-foreground">{{ formatDateTime(draft.updatedAt) }}</span>
        </div>
        <p class="mt-1 truncate text-sm text-muted-foreground">
          {{ draft.status === 'generating' ? t('email.pendingDrafts.generatingPreview') : preview(draft.content) }}
        </p>
      </NuxtLinkLocale>
      <Button
        v-if="draft.status === 'ready'"
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
