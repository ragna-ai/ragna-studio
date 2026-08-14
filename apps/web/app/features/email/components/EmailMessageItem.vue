<script setup lang="ts">
import { EditorContent } from '@repo/editor';
import { Avatar, AvatarFallback } from '~/components/ui/avatar';
import { useDateTimeFormat } from '~/composables/useDateTimeFormat';
import EmailMessageAttachments from '~/features/email/components/EmailMessageAttachments.vue';
import { useEmailReadOnlyBody } from '~/features/email/composables/useEmailReadOnlyBody';
import { formatParticipant, formatParticipantList, participantInitials } from '~/features/email/lib/email-display';
import type { EmailMessageDetail } from '~/features/email/types';

// Purely a message row: header (avatar/from/date) + expanded body/
// attachments. No per-message actions here - reply/reply all/forward and
// star/read/archive/trash all live once, in EmailThreadView.vue's top bar,
// to avoid the icon duplication a per-message action row created.

// Props
const props = defineProps<{
  message: EmailMessageDetail;
  expanded: boolean;
}>();

// Emits
const emit = defineEmits<{
  toggleExpand: [];
}>();

// Composables
const { t } = useI18n();
const { formatDateTime } = useDateTimeFormat();
// `body` should always be present on a loaded message, but the detail
// cache can be patched by an action response that carries no body at all
// (EmailMessageActionRow - see patchThreadDetail in email-thread-cache.ts);
// falling back to '' here instead of crashing is the last line of defense
// if that merge is ever wrong again.
const { editor } = useEmailReadOnlyBody(props.message.body?.markdown ?? '');

// Computed
const toLabel = computed(() => formatParticipantList(props.message.to));
</script>

<template>
  <article class="border-b last:border-b-0">
    <button
      type="button"
      class="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/30"
      @click="emit('toggleExpand')"
    >
      <Avatar class="size-8 shrink-0">
        <AvatarFallback class="text-xs">{{ participantInitials(props.message.from) }}</AvatarFallback>
      </Avatar>
      <div class="min-w-0 flex-1">
        <div class="flex items-center justify-between gap-2">
          <p class="truncate text-sm font-medium" :class="{ 'font-semibold': props.message.isUnread }">
            {{ formatParticipant(props.message.from) }}
          </p>
          <span class="shrink-0 text-xs text-muted-foreground">{{ formatDateTime(props.message.sentAt) }}</span>
        </div>
        <p v-if="props.expanded" class="truncate text-xs text-muted-foreground">
          {{ t('email.message.to', { recipients: toLabel }) }}
        </p>
      </div>
    </button>

    <div v-if="props.expanded" class="px-4 pb-4">
      <div class="document-sheet min-h-16 rounded-md border-0 bg-transparent px-0 py-0">
        <EditorContent :editor="editor" class="flex flex-1 flex-col text-sm" />
      </div>

      <EmailMessageAttachments :message-id="props.message.id" :expanded="props.expanded" />
    </div>
  </article>
</template>

<style src="~/features/document/components/DocumentEditor.css"></style>
