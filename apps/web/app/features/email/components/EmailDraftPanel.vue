<script setup lang="ts">
import { SparklesIcon, Trash2Icon } from '@lucide/vue';
import { refAutoReset } from '@vueuse/core';
import { Button } from '~/components/ui/button';
import { Spinner } from '~/components/ui/spinner';
import EmailComposer from '~/features/email/components/EmailComposer.vue';
import { useDiscardEmailDraft } from '~/features/email/composables/useEmailDraftApi';
import type { EmailDraft, SendEmailResponse } from '~/features/email/types';

// The one draft surface, used by all five entry points (new, reply,
// reply-all, forward, AI) and rendered inline wherever a thread's active
// draft appears. Recipients,
// subject and body come straight off `draft` - seeding happens server-side
// at creation, this panel only renders what it's given and hosts the
// discard action; EmailComposer.vue owns the autosave/send mutations
// themselves (see its header comment) and reports saving state up via
// `saving`/`saved`.
const props = defineProps<{ draft: EmailDraft }>();

const emit = defineEmits<{
  sent: [SendEmailResponse];
}>();

// Composables
const { t } = useI18n();
const { mutate: discardDraft, isPending: isDiscarding } =
  useDiscardEmailDraft();

// Refs
const rootEl = useTemplateRef<HTMLDivElement>('rootEl');
const isSaving = ref(false);
// Flips true right after a save settles, then auto-resets (VueUse
// refAutoReset) so the "Saved" hint fades on its own instead of needing a
// timer wired up and torn down by hand.
const justSaved = refAutoReset(false, 2000);
// Set synchronously the moment Discard is clicked, and never reset - unlike
// `isDiscarding` (the mutation's own `isPending`), which flips back to
// `false` as soon as the discard request settles, well before the query
// invalidation it triggers actually removes this draft from the parent's
// view and unmounts EmailComposer. `isDiscarding` would already read
// `false` by the time EmailComposer's unmount-flush guard runs; this flag
// doesn't have that timing gap.
const isDiscarded = ref(false);

// Computed
const kindLabel = computed(() => {
  switch (props.draft.kind) {
    case 'forward':
      return t('email.message.forward');
    case 'reply':
      return t('email.message.reply');
    default:
      return t('email.compose.newTitle');
  }
});
// Forward and new mail start with empty recipients, so focus goes there;
// reply already has a recipient and starts the cursor in the body instead
// (the spec covers forward/reply; `new` follows the same rule by choice).
const bodyAutofocus = computed<'start' | 'end' | undefined>(() =>
  props.draft.kind === 'reply' ? 'start' : undefined,
);
const recipientsAutofocus = computed(() => props.draft.kind !== 'reply');

// Functions
function handleDiscard() {
  isDiscarded.value = true;
  discardDraft({ draftId: props.draft.id, threadId: props.draft.threadId });
}

defineExpose({
  scrollIntoView: () =>
    rootEl.value?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
});
</script>

<template>
  <div
    ref="rootEl"
    class="border-b"
    :class="props.draft.origin === 'ai' ? 'bg-amber-50/50' : 'bg-muted/30'"
  >
    <div
      v-if="props.draft.status === 'generating'"
      class="flex items-center gap-2 px-4 py-4 text-sm text-muted-foreground"
    >
      <Spinner class="size-4" />
      {{ t('email.draft.generating') }}
    </div>
    <div v-else-if="props.draft.status === 'ready'">
      <div
        class="flex items-center justify-between border-b px-4 py-2 text-xs font-medium"
        :class="
          props.draft.origin === 'ai'
            ? 'border-amber-200 text-amber-700'
            : 'border-border text-muted-foreground'
        "
      >
        <div class="flex items-center gap-2">
          <SparklesIcon v-if="props.draft.origin === 'ai'" class="size-3.5" />
          {{ kindLabel }}
        </div>
        <span v-if="isSaving">{{ t('email.draft.panel.saving') }}</span>
        <span v-else-if="justSaved">{{ t('email.draft.panel.saved') }}</span>
      </div>
      <EmailComposer
        :draft="props.draft"
        :autofocus="bodyAutofocus"
        :recipients-autofocus="recipientsAutofocus"
        :suppress-flush="isDiscarded"
        @saving="isSaving = $event"
        @saved="justSaved = true"
        @sent="emit('sent', $event)"
      >
        <template #extra-actions>
          <Button
            type="button"
            variant="ghost"
            :disabled="isDiscarding"
            @click="handleDiscard"
          >
            <Trash2Icon class="mr-2 size-3.5" />
            {{ t('email.draft.discard') }}
          </Button>
        </template>
      </EmailComposer>
    </div>
  </div>
</template>
