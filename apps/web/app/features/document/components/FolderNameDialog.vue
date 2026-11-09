<script setup lang="ts">
import { useForm } from '@tanstack/vue-form';
import { z } from 'zod';
import {
  useCreateFolder,
  useRenameFolder,
} from '~/features/document/composables/useFolderApi';
import type { Folder } from '~/features/document/types';

// Props
interface Props {
  /** Renames this folder. Creates a new folder when omitted. */
  folder?: Folder;
}
const props = defineProps<Props>();

// Refs
const open = defineModel<boolean>('open', { default: false });

// Composables
const { mutateAsync: createFolder, isPending: isCreating } = useCreateFolder();
const { mutateAsync: renameFolder, isPending: isRenaming } = useRenameFolder();
const { t } = useI18n();

const nameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { message: t('common.nameRequired') })
    .max(255),
});

const form = useForm({
  defaultValues: { name: props.folder?.name ?? '' },
  validators: { onChange: nameSchema },
  onSubmit: async ({ value }) => {
    const name = value.name.trim();
    if (props.folder) {
      await renameFolder({ folderId: props.folder.id, name });
    } else {
      await createFolder({ name });
    }
    open.value = false;
  },
});

// Computed
const isPending = computed(() => isCreating.value || isRenaming.value);
const dialogTitle = computed(() =>
  props.folder
    ? t('folder.renameDialog.title')
    : t('folder.createDialog.title'),
);
const submitLabel = computed(() =>
  props.folder ? t('common.save') : t('common.create'),
);

// Hooks
watch(open, (isOpen) => {
  if (!isOpen) {
    return;
  }
  form.reset({ name: props.folder?.name ?? '' });
});
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ dialogTitle }}</DialogTitle>
      </DialogHeader>

      <form class="space-y-4" @submit.prevent.stop="form.handleSubmit">
        <form.Field name="name">
          <template v-slot="{ field, state }">
            <div>
              <Label class="mb-2 block text-sm font-medium" :for="field.name">
                {{ t('common.name') }}
              </Label>
              <Input
                :id="field.name"
                autofocus
                :model-value="state.value"
                :placeholder="t('folder.createDialog.namePlaceholder')"
                autocomplete="off"
                @update:model-value="(v) => field.handleChange(String(v))"
                @blur="field.handleBlur"
              />
              <FormFieldInfo :state="state" />
            </div>
          </template>
        </form.Field>

        <DialogFooter>
          <Button type="button" variant="outline" @click="open = false">
            {{ t('common.cancel') }}
          </Button>
          <Button type="submit" :disabled="isPending" :loading="isPending">
            {{ submitLabel }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
