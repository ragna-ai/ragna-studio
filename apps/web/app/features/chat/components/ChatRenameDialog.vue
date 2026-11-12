<script setup lang="ts">
import { useForm } from '@tanstack/vue-form';
import type { ChatHistoryItem } from '~/features/chat/composables/useChatApi';
import { useUpdateChatTitle } from '~/features/chat/composables/useChatApi';
import { createChatTitleSchema } from '~/features/chat/lib/chat-title-schema';

// Props
interface ChatRenameDialogProps {
  chat: Pick<ChatHistoryItem, 'id' | 'title'>;
}
const props = defineProps<ChatRenameDialogProps>();

// Refs
const open = defineModel<boolean>('open', { default: false });

// Composables
const { mutate: updateChatTitle, isPending } = useUpdateChatTitle();
const { t } = useI18n();

const form = useForm({
  defaultValues: { title: props.chat.title },
  validators: {
    onChange: createChatTitleSchema(t('chat.history.titleRequired')),
  },
  onSubmit: ({ value }) => {
    const title = value.title.trim();
    if (title === props.chat.title) {
      open.value = false;
      return;
    }
    updateChatTitle(
      { chatId: props.chat.id, title },
      { onSuccess: () => (open.value = false) },
    );
  },
});

// Hooks
watch(open, (isOpen) => {
  if (!isOpen) {
    return;
  }
  form.reset({ title: props.chat.title });
});
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ t('chat.history.rename') }}</DialogTitle>
      </DialogHeader>

      <form class="space-y-4" @submit.prevent.stop="form.handleSubmit">
        <form.Field name="title">
          <template v-slot="{ field, state }">
            <div>
              <Label class="mb-2 block text-sm font-medium" :for="field.name">
                {{ t('common.title') }}
              </Label>
              <Input
                :id="field.name"
                autofocus
                :model-value="state.value"
                autocomplete="off"
                @update:model-value="(v) => field.handleChange(String(v))"
                @blur="field.handleBlur"
              />
              <FormFieldInfo :field="field" />
            </div>
          </template>
        </form.Field>

        <DialogFooter>
          <Button type="button" variant="outline" @click="open = false">
            {{ t('common.cancel') }}
          </Button>
          <Button type="submit" :disabled="isPending" :loading="isPending">
            {{ t('common.save') }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
