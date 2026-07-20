<script setup lang="ts">
import { useForm } from '@tanstack/vue-form';
import { z } from 'zod';
import { useCreateDocument } from '~/features/document/composables/useDocumentApi';
import type { Folder } from '~/features/document/types';

// shadcn's Select can't use an empty string as an item value (it's the
// internal "no selection" sentinel), so "No folder" needs its own
// placeholder value, mapped back to `null` on submit. Same pattern as
// AgentToolList's NO_DATASET.
const NO_FOLDER = '__none__';

const createDocumentSchema = z.object({
  title: z.string().min(1, { message: 'Title is required.' }),
  folderId: z.string(),
});

// Props
const props = defineProps<{ folders: Folder[] }>();

// Refs
const open = defineModel<boolean>('open', { default: false });

// Composables
const { mutateAsync: createDocument, isPending } = useCreateDocument();
const { t } = useI18n();

const form = useForm({
  defaultValues: { title: '', folderId: NO_FOLDER },
  validators: { onChange: createDocumentSchema },
  onSubmit: async ({ value }) => {
    const response = await createDocument({
      title: value.title,
      folderId: value.folderId === NO_FOLDER ? null : value.folderId,
    });
    open.value = false;
    form.reset();
    await navigateTo(`/document/${response.document.id}`);
  },
});
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ t('document.createDialog.title') }}</DialogTitle>
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
                :placeholder="t('document.createDialog.namePlaceholder')"
                autocomplete="off"
                @update:model-value="(v) => field.handleChange(String(v))"
                @blur="field.handleBlur"
              />
              <FormFieldInfo :state="state" />
            </div>
          </template>
        </form.Field>

        <form.Field name="folderId">
          <template v-slot="{ field, state }">
            <div>
              <Label class="mb-2 block text-sm font-medium">
                {{ t('common.folder') }}
              </Label>
              <Select :model-value="state.value" @update:model-value="(v) => field.handleChange(String(v))">
                <SelectTrigger class="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem :value="NO_FOLDER">
                    {{ t('document.createDialog.folderNone') }}
                  </SelectItem>
                  <SelectItem v-for="folder in props.folders" :key="folder.id" :value="folder.id">
                    {{ folder.name }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </template>
        </form.Field>

        <DialogFooter>
          <Button type="button" variant="secondary" @click="open = false">
            {{ t('common.cancel') }}
          </Button>
          <Button type="submit" :disabled="isPending">
            <Spinner v-if="isPending" class="mr-2" />
            {{ t('common.create') }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
