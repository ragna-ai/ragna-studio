<script setup lang="ts">
import { Spinner } from '~/components/ui/spinner';
import EmailDraftListItem from '~/features/email/components/EmailDraftListItem.vue';
import { useDiscardEmailDraft } from '~/features/email/composables/useEmailDraftApi';
import type { EmailDraft } from '~/features/email/types';

// Props
const props = defineProps<{
  drafts: EmailDraft[];
  activeDraftId: string | null;
  activeThreadId: string | null;
  isLoading: boolean;
}>();

// Emits
const emit = defineEmits<{
  open: [EmailDraft];
}>();

// Composables
const { t } = useI18n();
const { mutate: discardDraft } = useDiscardEmailDraft();

function isActive(draft: EmailDraft): boolean {
  return (
    draft.id === props.activeDraftId ||
    (draft.threadId !== null && draft.threadId === props.activeThreadId)
  );
}
</script>

<template>
  <div class="flex h-full w-96 shrink-0 flex-col border-r">
    <div v-if="props.isLoading" class="flex flex-1 items-center justify-center">
      <Spinner />
    </div>
    <p
      v-else-if="props.drafts.length === 0"
      class="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground"
    >
      {{ t('email.draftsFolder.empty') }}
    </p>
    <ul v-else class="min-h-0 flex-1 overflow-y-auto">
      <EmailDraftListItem
        v-for="draft in props.drafts"
        :key="draft.id"
        :draft="draft"
        :is-active="isActive(draft)"
        @open="emit('open', draft)"
        @discard="discardDraft({ draftId: draft.id, threadId: draft.threadId })"
      />
    </ul>
  </div>
</template>
