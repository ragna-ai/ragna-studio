<script setup lang="ts">
import { SparklesIcon, Trash2Icon } from '@lucide/vue';
import { Button } from '~/components/ui/button';
import { Spinner } from '~/components/ui/spinner';
import EmailComposer from '~/features/email/components/EmailComposer.vue';
import { useDiscardEmailDraft } from '~/features/email/composables/useEmailDraftApi';
import { buildReplySubject } from '~/features/email/lib/email-reply-quote';
import type { EmailDraft, EmailMessageDetail, SendEmailResponse } from '~/features/email/types';

// AI draft review panel, inline in the thread view (docs/email/prd.md:
// "AI drafts appear inline on the thread with edit / discard / send").
// 'generating' shows progress; 'ready' hydrates straight into the same
// composer used everywhere else, so "send" and "edit then send" are the
// same action (the user can just start typing before hitting send).
const props = defineProps<{
  draft: EmailDraft;
  replyToMessage: EmailMessageDetail | null;
  threadSubject: string | null;
}>();

const emit = defineEmits<{
  sent: [SendEmailResponse];
}>();

// Composables
const { t } = useI18n();
const { mutate: discardDraft, isPending: isDiscarding } = useDiscardEmailDraft();

// Computed
const initialTo = computed(() => (props.replyToMessage ? [props.replyToMessage.from.email] : []));
const subject = computed(() => buildReplySubject(props.threadSubject));

// Functions
function handleDiscard() {
  discardDraft({ draftId: props.draft.id, threadId: props.draft.threadId });
}
</script>

<template>
  <div class="border-b bg-amber-50/50">
    <div v-if="props.draft.status === 'generating'" class="flex items-center gap-2 px-4 py-4 text-sm text-muted-foreground">
      <Spinner class="size-4" />
      {{ t('email.draft.generating') }}
    </div>
    <div v-else-if="props.draft.status === 'ready'">
      <div class="flex items-center gap-2 border-b border-amber-200 px-4 py-2 text-xs font-medium text-amber-700">
        <SparklesIcon class="size-3.5" />
        {{ t('email.draft.readyBadge') }}
      </div>
      <EmailComposer
        :draft-id="props.draft.id"
        :thread-id="props.draft.threadId"
        :initial-to="initialTo"
        :subject="subject"
        :content="props.draft.content"
        :show-cancel="false"
        @sent="emit('sent', $event)"
      >
        <template #extra-actions>
          <Button type="button" variant="ghost" :disabled="isDiscarding" @click="handleDiscard">
            <Trash2Icon class="mr-2 size-3.5" />
            {{ t('email.draft.discard') }}
          </Button>
        </template>
      </EmailComposer>
    </div>
  </div>
</template>
