<script setup lang="ts">
import {
  CheckIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  XIcon,
} from '@lucide/vue';
import { useForm } from '@tanstack/vue-form';
import { z } from 'zod';
import {
  useCreateFolder,
  useDeleteFolder,
  useRenameFolder,
} from '~/features/document/composables/useFolderApi';
import type { Folder } from '~/features/document/types';

const createFolderSchema = z.object({
  name: z.string().min(1, { message: 'Name is required.' }),
});

// Props
const props = defineProps<{ folders: Folder[] }>();

// Refs
const open = defineModel<boolean>('open', { default: false });
const editingFolderId = ref<string | null>(null);
const editingName = ref('');

// Composables
const { mutateAsync: createFolder, isPending: isCreating } = useCreateFolder();
const { mutateAsync: renameFolder, isPending: isRenaming } = useRenameFolder();
const { mutateAsync: deleteFolder } = useDeleteFolder();
const { confirm } = useConfirmDialog();
const { t } = useI18n();

const createForm = useForm({
  defaultValues: { name: '' },
  validators: { onChange: createFolderSchema },
  onSubmit: async ({ value }) => {
    await createFolder(value);
    createForm.reset();
  },
});

// Functions
function startEditing(folder: Folder) {
  editingFolderId.value = folder.id;
  editingName.value = folder.name;
}

function cancelEditing() {
  editingFolderId.value = null;
  editingName.value = '';
}

async function saveEditing() {
  const folderId = editingFolderId.value;
  const name = editingName.value.trim();
  if (!folderId || !name) {
    return;
  }
  await renameFolder({ folderId, name });
  cancelEditing();
}

async function handleDelete(folder: Folder) {
  const confirmed = await confirm({
    title: t('folder.manage.deleteTitle'),
    message: t('folder.manage.deleteMessage', { name: folder.name }),
    confirmLabel: t('common.delete'),
    cancelLabel: t('common.cancel'),
    variant: 'destructive',
  });
  if (!confirmed) {
    return;
  }
  await deleteFolder(folder.id);
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ t('folder.manage.title') }}</DialogTitle>
        <DialogDescription>{{
          t('folder.manage.description')
        }}</DialogDescription>
      </DialogHeader>

      <form
        class="flex items-start gap-2"
        @submit.prevent.stop="createForm.handleSubmit"
      >
        <createForm.Field name="name">
          <template v-slot="{ field, state }">
            <div class="flex-1">
              <Input
                :id="field.name"
                :model-value="state.value"
                :placeholder="t('folder.manage.namePlaceholder')"
                autocomplete="off"
                @update:model-value="(v) => field.handleChange(String(v))"
                @blur="field.handleBlur"
              />
              <FormFieldInfo :state="state" />
            </div>
          </template>
        </createForm.Field>
        <Button type="submit" size="icon" :disabled="isCreating">
          <Spinner v-if="isCreating" />
          <PlusIcon v-else class="size-4" />
        </Button>
      </form>

      <Separator v-if="folders.length > 0" />

      <ul v-if="folders.length > 0" class="max-h-64 space-y-1 overflow-y-auto">
        <li
          v-for="folder in folders"
          :key="folder.id"
          class="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-stone-50"
        >
          <template v-if="editingFolderId === folder.id">
            <Input
              v-model="editingName"
              autocomplete="off"
              class="h-8 flex-1"
              @keyup.enter="saveEditing"
              @keyup.esc="cancelEditing"
            />
            <Button
              variant="ghost"
              size="icon"
              :disabled="isRenaming"
              :aria-label="t('common.saveRename')"
              @click="saveEditing"
            >
              <Spinner v-if="isRenaming" />
              <CheckIcon v-else class="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              :aria-label="t('common.cancelRename')"
              @click="cancelEditing"
            >
              <XIcon class="size-4" />
            </Button>
          </template>
          <template v-else>
            <span class="flex-1 truncate text-sm">{{ folder.name }}</span>
            <Button
              variant="ghost"
              size="icon"
              :aria-label="t('folder.manage.rename')"
              @click="startEditing(folder)"
            >
              <PencilIcon class="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              :aria-label="t('folder.manage.delete')"
              @click="handleDelete(folder)"
            >
              <Trash2Icon class="size-4 text-destructive" />
            </Button>
          </template>
        </li>
      </ul>
      <p v-else class="text-sm text-muted-foreground">
        {{ t('folder.manage.empty') }}
      </p>

      <DialogFooter>
        <Button variant="secondary" @click="open = false">
          {{ t('common.close') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
