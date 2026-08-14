<script setup lang="ts">
import { Dialog, DialogContent, DialogTitle } from '~/components/ui/dialog';
import EmailComposer from '~/features/email/components/EmailComposer.vue';
import type { SendEmailResponse } from '~/features/email/types';

// Props: same shape as EmailComposer, this just adds the modal chrome so
// "New mail", "Reply", "Reply all", and "Forward" (EmailThreadView.vue) can
// all open the same overlay.
const props = defineProps<{
  title: string;
  initialTo?: string[];
  initialCc?: string[];
  initialBcc?: string[];
  subject: string;
  content: string;
  threadId?: string;
  replyToMessageId?: string;
}>();

const emit = defineEmits<{
  sent: [SendEmailResponse];
}>();

const open = defineModel<boolean>('open', { default: false });

function handleSent(result: SendEmailResponse) {
  open.value = false;
  emit('sent', result);
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent
      class="flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-3xl lg:max-w-4xl"
      :show-close-button="false"
    >
      <DialogTitle class="border-b px-4 py-3 text-sm font-medium">{{ props.title }}</DialogTitle>
      <EmailComposer
        v-if="open"
        :initial-to="props.initialTo"
        :initial-cc="props.initialCc"
        :initial-bcc="props.initialBcc"
        :subject="props.subject"
        :content="props.content"
        :thread-id="props.threadId"
        :reply-to-message-id="props.replyToMessageId"
        autofocus="end"
        @sent="handleSent"
        @cancel="open = false"
      />
    </DialogContent>
  </Dialog>
</template>
