<script setup lang="ts">
import { SparklesIcon, Trash2Icon } from '@lucide/vue';
import { Button } from '~/components/ui/button';
import { useDateTimeFormat } from '~/composables/useDateTimeFormat';
import { formatParticipantList } from '~/features/email/lib/email-display';
import type { EmailDraft } from '~/features/email/types';

// Props
const props = defineProps<{
  draft: EmailDraft;
  isActive: boolean;
}>();

// Emits
const emit = defineEmits<{
  open: [];
  discard: [];
}>();

// Composables
const { t } = useI18n();
const { formatDateTime } = useDateTimeFormat();

// Computed
const recipientsLabel = computed(
  () =>
    formatParticipantList(props.draft.to) || t('email.thread.unknownSender'),
);

function snippet(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > 160 ? `${trimmed.slice(0, 160)}…` : trimmed;
}
</script>

<template>
  <li
    class="group flex cursor-pointer items-start gap-3 border-b px-3 py-3 hover:bg-muted/50"
    :class="{ 'bg-muted': props.isActive }"
    @click="emit('open')"
  >
    <SparklesIcon
      v-if="props.draft.origin === 'ai'"
      class="mt-0.5 size-4 shrink-0 text-amber-500"
    />
    <div class="min-w-0 flex-1">
      <div class="flex items-center justify-between gap-2">
        <p class="truncate text-sm font-medium">{{ recipientsLabel }}</p>
        <span
          class="shrink-0 text-xs text-muted-foreground group-hover:opacity-0"
        >
          {{ formatDateTime(props.draft.updatedAt) }}
        </span>
      </div>
      <p class="truncate text-sm text-muted-foreground">
        {{ props.draft.subject || t('email.thread.noSubject') }}
      </p>
      <div class="mt-1 flex items-center gap-2">
        <span
          v-if="props.draft.status === 'generating'"
          class="truncate rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
        >
          {{ t('email.draft.generating') }}
        </span>
        <p v-else class="truncate text-xs text-muted-foreground">
          {{ snippet(props.draft.text) }}
        </p>
      </div>
    </div>
    <Button
      v-if="props.draft.status !== 'generating'"
      variant="ghost"
      size="icon"
      class="size-7 shrink-0 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
      :aria-label="t('email.draft.discard')"
      @click.stop="emit('discard')"
    >
      <Trash2Icon class="size-3.5 text-destructive" />
    </Button>
  </li>
</template>
