<script setup lang="ts">
import { EditorContent } from '@repo/editor';
import EditorMenu from '~/features/document/components/EditorMenu.vue';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Spinner } from '~/components/ui/spinner';
import EmailComposerAttachments from '~/features/email/components/EmailComposerAttachments.vue';
import EmailRecipientsField from '~/features/email/components/EmailRecipientsField.vue';
import { useEmailComposeEditor } from '~/features/email/composables/useEmailComposeEditor';
import { useSendEmail } from '~/features/email/composables/useEmailSendApi';
import { useSendEmailDraft } from '~/features/email/composables/useEmailDraftApi';
import type { MediaListItem, SendEmailResponse } from '~/features/email/types';

// New mail, reply, reply-all, forward, and AI-draft review all funnel
// through this one form; callers only differ in the initial
// recipients/subject/content they pass (EmailThreadView.vue for reply/
// forward, EmailClient.vue for new mail, EmailDraftPanel.vue for a ready
// draft). When `draftId` is set, send goes through
// POST /email/draft/:draftId/send instead of POST /email/send, which also
// persists the (possibly-edited) markdown back onto the draft row.
const props = defineProps<{
  initialTo?: string[];
  initialCc?: string[];
  initialBcc?: string[];
  subject: string;
  /** Markdown, already including a quoted reply block for reply/forward (buildReplyQuoteMarkdown). */
  content: string;
  threadId?: string;
  replyToMessageId?: string;
  draftId?: string;
  autofocus?: 'start' | 'end';
  showCancel?: boolean;
}>();

const emit = defineEmits<{
  sent: [SendEmailResponse];
  cancel: [];
}>();

// Composables
const { t } = useI18n();
const { mutateAsync: sendEmail, isPending: isSendingEmail } = useSendEmail();
const { mutateAsync: sendEmailDraft, isPending: isSendingDraft } = useSendEmailDraft();
const isSending = computed(() => isSendingEmail.value || isSendingDraft.value);

// Refs
const to = ref<string[]>(props.initialTo ?? []);
const cc = ref<string[]>(props.initialCc ?? []);
const bcc = ref<string[]>(props.initialBcc ?? []);
const showCcBcc = ref((props.initialCc?.length ?? 0) > 0 || (props.initialBcc?.length ?? 0) > 0);
const subject = ref(props.subject);
const files = ref<File[]>([]);
const media = ref<MediaListItem[]>([]);

const controller = useEmailComposeEditor({
  content: props.content,
  placeholder: t('email.compose.bodyPlaceholder'),
  autofocus: props.autofocus ?? 'start',
});
const editor = controller.editor;

// Computed
const canSend = computed(() => to.value.length > 0 && subject.value.trim().length > 0 && !isSending.value);

// Functions
// Both mutations already toast their own errors (useEmailSendApi.ts /
// useEmailDraftApi.ts's onError); the try/catch here only stops that
// rejection from also surfacing as an unhandled promise rejection, and
// keeps the composer open (no 'sent' emit) so the user can retry.
async function handleSend() {
  if (!canSend.value) return;

  const shared = {
    to: to.value,
    cc: cc.value.length > 0 ? cc.value : undefined,
    bcc: bcc.value.length > 0 ? bcc.value : undefined,
    subject: subject.value.trim(),
    html: controller.getHtml(),
    text: controller.getMarkdown(),
    files: files.value,
    mediaIds: media.value.map((item) => item.id),
  };

  try {
    const result = props.draftId
      ? await sendEmailDraft({
          ...shared,
          draftId: props.draftId,
          threadId: props.threadId ?? '',
          content: controller.getMarkdown(),
        })
      : await sendEmail({
          ...shared,
          threadId: props.threadId,
          replyToMessageId: props.replyToMessageId,
        });

    emit('sent', result);
  } catch {
    // Already toasted by the mutation's onError.
  }
}
</script>

<template>
  <form class="flex min-h-0 flex-1 flex-col overflow-y-auto" @submit.prevent="handleSend">
    <div class="shrink-0 space-y-1 px-4 pt-3">
      <EmailRecipientsField v-model="to" :label="t('email.compose.to')" />
      <template v-if="showCcBcc">
        <EmailRecipientsField v-model="cc" :label="t('email.compose.cc')" />
        <EmailRecipientsField v-model="bcc" :label="t('email.compose.bcc')" />
      </template>
      <button
        v-else
        type="button"
        class="pb-1 text-xs text-muted-foreground hover:text-foreground"
        @click="showCcBcc = true"
      >
        {{ t('email.compose.addCcBcc') }}
      </button>
      <div class="flex items-center gap-2 border-b py-1.5">
        <span class="w-10 shrink-0 text-sm text-muted-foreground">{{ t('email.compose.subject') }}</span>
        <Input
          v-model="subject"
          class="h-7 flex-1 border-0 px-0 shadow-none focus-visible:ring-0"
          :placeholder="t('email.compose.subjectPlaceholder')"
        />
      </div>
    </div>

    <div class="shrink-0 border-b">
      <EditorMenu :controller="controller" class="px-4 py-2" />
    </div>
    <!-- Auto-height, same document-sheet typography as the document/task editors
         (DocumentEditor.css) instead of a flex-1/overflow-y-auto box: the editor
         grows with its content and, when embedded in a bounded ancestor (the
         compose dialog), this form's own overflow-y-auto is what scrolls, not a
         separate clipped inner box. -->
    <div class="document-sheet min-h-40 px-4 py-3">
      <EditorContent :editor="editor" class="flex flex-1 flex-col" />
    </div>

    <div class="shrink-0 space-y-3 border-t px-4 py-3">
      <EmailComposerAttachments v-model:files="files" v-model:media="media" />
      <div class="flex items-center justify-end gap-2">
        <slot name="extra-actions" />
        <Button v-if="props.showCancel ?? true" type="button" variant="ghost" @click="emit('cancel')">
          {{ t('common.cancel') }}
        </Button>
        <Button type="submit" :disabled="!canSend">
          <Spinner v-if="isSending" class="mr-2" />
          {{ t('email.compose.send') }}
        </Button>
      </div>
    </div>
  </form>
</template>

<style src="~/features/document/components/DocumentEditor.css"></style>
