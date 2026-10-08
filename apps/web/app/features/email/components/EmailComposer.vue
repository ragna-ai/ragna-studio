<script setup lang="ts">
import { EditorContent } from '@repo/editor';
import { useDebounceFn } from '@vueuse/core';
import EditorMenu from '~/features/document/components/EditorMenu.vue';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Spinner } from '~/components/ui/spinner';
import EmailComposerAttachments from '~/features/email/components/EmailComposerAttachments.vue';
import EmailRecipientsField from '~/features/email/components/EmailRecipientsField.vue';
import { useEmailComposeEditor } from '~/features/email/composables/useEmailComposeEditor';
import { useSendEmailDraft, useUpdateEmailDraft } from '~/features/email/composables/useEmailDraftApi';
import type {
  EmailDraft,
  EmailDraftAttachment,
  EmailDraftEditableFields,
  EmailParticipant,
  MediaListItem,
  SendEmailResponse,
} from '~/features/email/types';

// The one form behind every draft (new mail, reply, reply-all, forward, and
// AI-draft review - EmailDraftPanel.vue is the only remaining caller now
// that EmailComposeDialog.vue is gone). Every draft is a persisted row by
// the time this mounts, so `draft` seeds the form once.
//
// This component owns both draft mutations (autosave PATCH and send), not
// just send: awaiting the pre-send flush (see `handleSend`) requires the
// PATCH to live where it can be awaited, and threading that through a
// parent-owned mutation via events would just add indirection for no
// benefit. EmailDraftPanel.vue only keeps `useDiscardEmailDraft` for its own
// explicit Discard action, and renders `saving`/`saved` off this
// component's events rather than a mutation of its own.
const props = defineProps<{
  draft: EmailDraft;
  /** 'start'/'end' focuses the body; omitted means don't autofocus it (e.g. recipients should get focus instead). */
  autofocus?: 'start' | 'end';
  recipientsAutofocus?: boolean;
  /** True while the panel has independently started discarding this draft - see the unmount-flush guard below. */
  suppressFlush?: boolean;
}>();

const emit = defineEmits<{
  sent: [SendEmailResponse];
  saving: [boolean];
  saved: [];
}>();

// Composables
const { t } = useI18n();
const { mutateAsync: sendEmailDraft, isPending: isSending } = useSendEmailDraft();
const { mutateAsync: saveDraft, isPending: isSavingDraft } = useUpdateEmailDraft();
watch(isSavingDraft, (value) => emit('saving', value));

// Refs
const to = ref<string[]>(props.draft.to.map((participant) => participant.email));
const cc = ref<string[]>(props.draft.cc.map((participant) => participant.email));
const bcc = ref<string[]>(props.draft.bcc.map((participant) => participant.email));
const showCcBcc = ref(cc.value.length > 0 || bcc.value.length > 0);
const subject = ref(props.draft.subject ?? '');
const draftAttachments = ref<EmailDraftAttachment[]>(props.draft.attachments);
const files = ref<File[]>([]);
const media = ref<MediaListItem[]>([]);
// Set once a send actually succeeds; guards the unmount-flush below from
// resurrecting a draft that just turned terminal. Can't use `isSending`
// for that guard: it's already back to `false` by the time this component
// unmounts (the 'sent' status only reaches the parent's query cache after
// the invalidation triggered in useSendEmailDraft's onSuccess refetches,
// which happens well after this mutation itself settles), so the flag has
// to be a plain, never-reset ref rather than a snapshot of mutation state.
const isDraftGone = ref(false);

const controller = useEmailComposeEditor({
  content: props.draft.content,
  placeholder: t('email.compose.bodyPlaceholder'),
  autofocus: props.autofocus,
  onUpdate: () => emitChange(),
});
const editor = controller.editor;

watch([to, cc, bcc, subject], () => emitChange());
onBeforeUnmount(() => {
  if (props.suppressFlush || isDraftGone.value || !emitChange.isPending.value) return;
  emitChange.cancel();
  void saveDraftNow(true);
});

// Computed
const canSend = computed(
  () => to.value.length > 0 && subject.value.trim().length > 0 && !isSending.value,
);

// Functions
function toParticipants(addresses: string[]): EmailParticipant[] {
  return addresses.map((email) => ({ email, name: null }));
}

/** The HTML/text pair every draft-writing payload below sends together, straight off the live editor (see EmailDraftEditableFields's doc comment). */
function buildContentFields(): Pick<EmailDraftEditableFields, 'content' | 'text'> {
  return {
    content: controller.getHtml(),
    text: controller.getText(),
  };
}

function buildSnapshot(): EmailDraftEditableFields {
  const { content, text } = buildContentFields();
  return {
    to: toParticipants(to.value),
    cc: toParticipants(cc.value),
    bcc: toParticipants(bcc.value),
    subject: subject.value,
    content,
    text,
    attachments: draftAttachments.value,
  };
}

// `flush` forces the provider write-back; set for the unmount flush and the pre-send save below.
async function saveDraftNow(flush: boolean) {
  try {
    await saveDraft({ draftId: props.draft.id, threadId: props.draft.threadId, ...buildSnapshot(), flush });
    emit('saved');
  } catch {
    // Already toasted by the mutation's onError.
  }
}

// Debounced ~1s after the last edit (specs/email/drafts-change-request.md,
// section 3), and debounced *here* rather than in EmailDraftPanel.vue: the
// real cost per call isn't building the snapshot object, it's
// `getHtml()`/`getText()` re-serializing the whole editor document, and
// that should run once per pause in typing, not once per keystroke.
const emitChange = useDebounceFn(() => {
  void saveDraftNow(false);
}, 1000);

function removeDraftAttachment(attachment: EmailDraftAttachment) {
  draftAttachments.value = draftAttachments.value.filter(
    (candidate) =>
      candidate.providerMessageId !== attachment.providerMessageId ||
      candidate.providerAttachmentId !== attachment.providerAttachmentId,
  );
  emitChange();
}

// Both mutations already toast their own errors (useEmailDraftApi.ts's
// onError); the try/catch here only stops that rejection from also
// surfacing as an unhandled promise rejection, and keeps the composer open
// (no 'sent' emit) so the user can retry.
async function handleSend() {
  if (!canSend.value) return;

  // `sendEmailDraft` acts on the draft's provider-side state via `providerDraftId`, which only
  // reflects the last PATCH - flush any pending autosave first so it has this exact content.
  emitChange.cancel();
  await saveDraftNow(true);

  try {
    const { content, text } = buildContentFields();
    const result = await sendEmailDraft({
      draftId: props.draft.id,
      threadId: props.draft.threadId,
      to: to.value,
      cc: cc.value.length > 0 ? cc.value : undefined,
      bcc: bcc.value.length > 0 ? bcc.value : undefined,
      subject: subject.value.trim(),
      html: content,
      text,
      content,
      files: files.value,
      mediaIds: media.value.map((item) => item.id),
    });

    isDraftGone.value = true;
    emit('sent', result);
  } catch {
    // Already toasted by the mutation's onError.
  }
}
</script>

<template>
  <form class="flex min-h-0 flex-1 flex-col overflow-y-auto" @submit.prevent="handleSend">
    <div class="shrink-0 space-y-1 px-4 pt-3">
      <EmailRecipientsField v-model="to" :label="t('email.compose.to')" :autofocus="props.recipientsAutofocus" />
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
         inline draft panel), this form's own overflow-y-auto is what scrolls, not a
         separate clipped inner box. -->
    <div class="document-sheet min-h-40 px-4 py-3">
      <EditorContent :editor="editor" class="flex flex-1 flex-col" />
    </div>

    <div class="shrink-0 space-y-3 border-t px-4 py-3">
      <EmailComposerAttachments
        v-model:files="files"
        v-model:media="media"
        :draft-attachments="draftAttachments"
        @remove-draft-attachment="removeDraftAttachment"
      />
      <div class="flex items-center justify-end gap-2">
        <slot name="extra-actions" />
        <Button type="submit" :disabled="!canSend">
          <Spinner v-if="isSending" class="mr-2" />
          {{ t('email.compose.send') }}
        </Button>
      </div>
    </div>
  </form>
</template>

<style src="~/features/document/components/DocumentEditor.css"></style>
