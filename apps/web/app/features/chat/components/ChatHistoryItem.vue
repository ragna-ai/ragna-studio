<script setup lang="ts">
import { useForm } from '@tanstack/vue-form';
import AgentMark from '~/features/agent/components/AgentMark.vue';
import { createChatTitleSchema } from '~/features/chat/lib/chat-title-schema';
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

const chatTitleSchema = createChatTitleSchema(t('chat.history.titleRequired'));

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
  // avoid the same autofocus/outside-click race handled in InlineNameField.
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
          size="sm"
          class="rounded-md px-2 py-0 text-body"
          :model-value="state.value"
          @update:model-value="(v) => field.handleChange(String(v))"
          @blur="
            () => {
              field.handleBlur();
              commitEdit();
            }
          "
        />
        <FormFieldInfo :field="field" />
      </template>
    </form.Field>
  </form>
  <div
    v-else
    class="group flex items-center gap-2.5 rounded-md border px-2"
    :class="[
      chat.forkedFrom ? 'min-h-13 py-1.5' : 'h-9',
      active
        ? 'border-border bg-sidebar-accent shadow-xs'
        : 'border-transparent hover:bg-border',
    ]"
  >
    <AgentMark :agent-id="chat.agent.id" :size="20" />
    <NuxtLinkLocale
      :to="`/chat/${chat.id}`"
      :title="chat.title"
      class="block min-w-0 flex-1 truncate text-body"
      :class="{ 'font-medium': active }"
    >
      {{ chat.title }}
      <span
        v-if="chat.forkedFrom"
        class="block truncate text-caption font-normal text-muted-foreground"
      >
        {{ t('chat.history.forkedFrom', { title: chat.forkedFrom.title }) }}
      </span>
    </NuxtLinkLocale>
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      class="shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
      :aria-label="t('chat.history.rename')"
      @click.prevent.stop="startEditing"
    >
      <Icon name="hugeicons:pencil-edit-02" class="size-3.5 text-icon" />
    </Button>
  </div>
</template>
