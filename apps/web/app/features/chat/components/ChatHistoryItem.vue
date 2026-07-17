<script setup lang="ts">
import { PencilIcon } from '@lucide/vue';
import { useForm } from '@tanstack/vue-form';
import { z } from 'zod';
import type { ChatHistoryItem } from '~/features/chat/composables/useChatApi';
import { useUpdateChatTitle } from '~/features/chat/composables/useChatApi';

// Props
const props = defineProps<{
  chat: ChatHistoryItem;
  active: boolean;
}>();

// Refs
const isEditing = ref(false);
const formRef = useTemplateRef('formRef');

// Composables
const { t } = useI18n();
const { mutate: updateChatTitle } = useUpdateChatTitle();

const chatTitleSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, { message: t('chat.history.titleRequired') }),
});

const form = useForm({
  defaultValues: { title: props.chat.title },
  validators: { onChange: chatTitleSchema },
  onSubmit: ({ value }) => {
    isEditing.value = false;
    if (value.title === props.chat.title) {
      return;
    }
    updateChatTitle({ chatId: props.chat.id, title: value.title });
  },
});

// Functions
function startEditing() {
  form.setFieldValue('title', props.chat.title);
  // The input is focused on mount, so isEditing flips after the next tick to
  // avoid the same autofocus/outside-click race handled in WorkflowNameField.
  nextTick(() => {
    isEditing.value = true;
  });
}

function cancelEditing() {
  isEditing.value = false;
}

function commitEdit() {
  if (!isEditing.value) {
    return;
  }
  form.handleSubmit();
}

onClickOutside(formRef, commitEdit);

onKeyStroke('Escape', (event) => {
  if (!isEditing.value) {
    return;
  }
  event.preventDefault();
  cancelEditing();
});
</script>

<template>
  <form v-if="isEditing" ref="formRef" @submit.prevent.stop="form.handleSubmit">
    <form.Field name="title">
      <template v-slot="{ field, state }">
        <Input
          :id="field.name"
          autofocus
          :aria-label="t('chat.history.rename')"
          autocomplete="off"
          class="h-7 px-2 py-0 text-sm"
          :model-value="state.value"
          @update:model-value="(v) => field.handleChange(String(v))"
          @blur="
            () => {
              field.handleBlur();
              commitEdit();
            }
          "
        />
        <FormFieldInfo :state="state" />
      </template>
    </form.Field>
  </form>
  <div
    v-else
    class="group flex items-center gap-1 rounded-md px-2 py-1.5 hover:bg-stone-100"
    :class="{ 'bg-stone-100 font-medium': active }"
  >
    <NuxtLinkLocale
      :to="`/chat/${chat.id}`"
      :title="chat.title"
      class="block flex-1 truncate text-sm"
    >
      {{ chat.title }}
    </NuxtLinkLocale>
    <Button
      type="button"
      variant="ghost"
      size="icon"
      class="size-6 shrink-0 opacity-0 group-hover:opacity-100"
      :aria-label="t('chat.history.rename')"
      @click.prevent.stop="startEditing"
    >
      <PencilIcon class="size-3.5 stroke-1.5 text-foreground/75" />
    </Button>
  </div>
</template>
