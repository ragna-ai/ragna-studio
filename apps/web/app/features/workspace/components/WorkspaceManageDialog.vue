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
  useCreateWorkspace,
  useDeleteWorkspace,
  useRenameWorkspace,
} from '~/features/workspace/composables/useWorkspaceApi';
import type { Workspace } from '~/features/workspace/types';

const createWorkspaceSchema = z.object({
  name: z.string().min(1, { message: 'Name is required.' }),
});

// Props
const props = defineProps<{ workspaces: Workspace[] }>();

// Refs
const open = defineModel<boolean>('open', { default: false });
const editingWorkspaceId = ref<string | null>(null);
const editingName = ref('');

// Composables
const { mutateAsync: createWorkspace, isPending: isCreating } =
  useCreateWorkspace();
const { mutateAsync: renameWorkspace, isPending: isRenaming } =
  useRenameWorkspace();
const { mutateAsync: deleteWorkspace } = useDeleteWorkspace();
const { confirm } = useConfirmDialog();
const { t } = useI18n();

const createForm = useForm({
  defaultValues: { name: '' },
  validators: { onChange: createWorkspaceSchema },
  onSubmit: async ({ value }) => {
    await createWorkspace(value);
    createForm.reset();
  },
});

// Computed
// The API rejects deleting a user's only workspace; disable the action
// up front instead of letting the user hit the 400.
const canDeleteWorkspace = computed(() => props.workspaces.length > 1);

// Functions
function startEditing(workspace: Workspace) {
  editingWorkspaceId.value = workspace.id;
  editingName.value = workspace.name;
}

function cancelEditing() {
  editingWorkspaceId.value = null;
  editingName.value = '';
}

async function saveEditing() {
  const workspaceId = editingWorkspaceId.value;
  const name = editingName.value.trim();
  if (!workspaceId || !name) {
    return;
  }
  await renameWorkspace({ workspaceId, name });
  cancelEditing();
}

async function handleDelete(workspace: Workspace) {
  // Guarded in the template too (disabled button), but re-checked here in
  // case the list changed between render and click.
  if (!canDeleteWorkspace.value) {
    return;
  }

  const confirmed = await confirm({
    title: t('workspace.manage.deleteTitle'),
    message: t('workspace.manage.deleteMessage', { name: workspace.name }),
    confirmLabel: t('common.delete'),
    cancelLabel: t('common.cancel'),
    variant: 'destructive',
  });
  if (!confirmed) {
    return;
  }

  // If the deleted workspace was active, WorkspaceSwitcher falls back to
  // another one once the invalidated workspace list refetches.
  await deleteWorkspace(workspace.id);
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ t('workspace.manage.title') }}</DialogTitle>
        <DialogDescription>
          {{ t('workspace.manage.description') }}
        </DialogDescription>
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
                :placeholder="t('workspace.manage.namePlaceholder')"
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

      <Separator v-if="workspaces.length > 0" />

      <ul
        v-if="workspaces.length > 0"
        class="max-h-64 space-y-1 overflow-y-auto"
      >
        <li
          v-for="workspace in workspaces"
          :key="workspace.id"
          class="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-stone-50"
        >
          <template v-if="editingWorkspaceId === workspace.id">
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
            <span class="flex-1 truncate text-sm">{{ workspace.name }}</span>
            <Button
              variant="ghost"
              size="icon"
              :aria-label="t('workspace.manage.rename')"
              @click="startEditing(workspace)"
            >
              <PencilIcon class="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              :disabled="!canDeleteWorkspace"
              :aria-label="
                canDeleteWorkspace
                  ? t('workspace.manage.delete')
                  : t('workspace.manage.deleteLastWorkspace')
              "
              :title="
                canDeleteWorkspace
                  ? undefined
                  : t('workspace.manage.deleteLastWorkspace')
              "
              @click="handleDelete(workspace)"
            >
              <Trash2Icon class="size-4 text-destructive" />
            </Button>
          </template>
        </li>
      </ul>
      <p v-else class="text-sm text-muted-foreground">
        {{ t('workspace.manage.empty') }}
      </p>

      <DialogFooter>
        <Button variant="secondary" @click="open = false">
          {{ t('common.close') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
