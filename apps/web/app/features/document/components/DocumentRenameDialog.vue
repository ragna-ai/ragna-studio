<script setup lang="ts">
import { useForm } from '@tanstack/vue-form';
import { z } from 'zod';
import { toast } from '~/lib/toast';
import { useUpdateDocument } from '~/features/document/composables/useDocumentApi';
import type { Document } from '~/features/document/types';

// Props
interface Props {
  /** The document to rename; the dialog does nothing while it's `null`. */
  document: Document | null;
}
const props = defineProps<Props>();

// Refs
const open = defineModel<boolean>('open', { default: false });

// Composables
const { mutateAsync: updateDocument, isPending } = useUpdateDocument();
const { t } = useI18n();

const titleSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, { message: t('common.nameRequired') })
    .max(255),
});

const form = useForm({
  defaultValues: { title: props.document?.title ?? '' },
  validators: { onChange: titleSchema },
  onSubmit: async ({ value }) => {
    if (!props.document) {
      return;
    }
    const title = value.title.trim();
    if (title !== props.document.title) {
      await updateDocument({ documentId: props.document.id, title });
      toast.success(t('document.toast.renamed'));
    }
    open.value = false;
  },
});

// Hooks
watch(open, (isOpen) => {
  if (!isOpen) {
    return;
  }
  form.reset({ title: props.document?.title ?? '' });
});
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ t('document.renameDialog.title') }}</DialogTitle>
      </DialogHeader>

      <form class="space-y-4" @submit.prevent.stop="form.handleSubmit">
        <form.Field name="title">
          <template v-slot="{ field, state }">
            <div>
              <Label class="mb-2 block text-sm font-medium" :for="field.name">
                {{ t('common.name') }}
              </Label>
              <Input
                :id="field.name"
                autofocus
                :model-value="state.value"
                :placeholder="t('document.createDialog.namePlaceholder')"
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
