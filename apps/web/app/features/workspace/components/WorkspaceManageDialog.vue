<script setup lang="ts">
import {
  ArrowLeftIcon,
  CheckIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  UsersIcon,
  XIcon,
} from '@lucide/vue';
import WorkspaceCreateDialog from '~/features/workspace/components/WorkspaceCreateDialog.vue';
import WorkspaceVisibilityIcon from '~/features/workspace/components/WorkspaceVisibilityIcon.vue';
import WorkspaceMembersPanel from '~/features/workspace/components/WorkspaceMembersPanel.vue';
import {
  useDeleteWorkspace,
  useRenameWorkspace,
} from '~/features/workspace/composables/useWorkspaceApi';
import {
  canDeleteWorkspace,
  canManageWorkspace,
  hasWorkspaceMembers,
} from '~/features/workspace/lib/workspace-roles';
import type { Workspace } from '~/features/workspace/types';

// Props
const props = defineProps<{ workspaces: Workspace[] }>();

// Refs
const open = defineModel<boolean>('open', { default: false });
const isCreateDialogOpen = ref(false);
const editingWorkspaceId = ref<string | null>(null);
const editingName = ref('');
const membersWorkspaceId = ref<string | null>(null);

// Composables
const { mutateAsync: renameWorkspace, isPending: isRenaming } =
  useRenameWorkspace();
const { mutateAsync: deleteWorkspace } = useDeleteWorkspace();
const { confirm } = useConfirmDialog();
const { t } = useI18n();

// Computed
const membersWorkspace = computed(() =>
  props.workspaces.find(
    (workspace) => workspace.id === membersWorkspaceId.value,
  ),
);

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
      <template v-if="membersWorkspace">
        <DialogHeader>
          <DialogTitle>{{ membersWorkspace.name }}</DialogTitle>
          <DialogDescription>
            {{ t('workspace.manage.membersDescription') }}
          </DialogDescription>
        </DialogHeader>
        <Button
          variant="ghost"
          size="sm"
          class="w-fit"
          @click="membersWorkspaceId = null"
        >
          <ArrowLeftIcon class="mr-1 size-4" />
          {{ t('workspace.manage.back') }}
        </Button>
        <WorkspaceMembersPanel
          :workspace="membersWorkspace"
          @left="membersWorkspaceId = null"
        />
      </template>

      <template v-else>
        <DialogHeader>
          <DialogTitle>{{ t('workspace.manage.title') }}</DialogTitle>
          <DialogDescription>
            {{ t('workspace.manage.description') }}
          </DialogDescription>
        </DialogHeader>

        <Button class="w-fit" @click="isCreateDialogOpen = true">
          <PlusIcon class="mr-1 size-4" />
          {{ t('workspace.manage.create') }}
        </Button>

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
              <WorkspaceVisibilityIcon
                :visibility="workspace.visibility"
                class="size-3.5 shrink-0 text-muted-foreground"
              />
              <span class="flex-1 truncate text-sm">{{ workspace.name }}</span>
              <Button
                v-if="hasWorkspaceMembers(workspace)"
                variant="ghost"
                size="icon"
                :aria-label="t('workspace.manage.members')"
                @click="membersWorkspaceId = workspace.id"
              >
                <UsersIcon class="size-4" />
              </Button>
              <Button
                v-if="canManageWorkspace(workspace)"
                variant="ghost"
                size="icon"
                :aria-label="t('workspace.manage.rename')"
                @click="startEditing(workspace)"
              >
                <PencilIcon class="size-4" />
              </Button>
              <Button
                v-if="canDeleteWorkspace(workspace)"
                variant="ghost"
                size="icon"
                :aria-label="t('workspace.manage.delete')"
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
      </template>
    </DialogContent>
  </Dialog>
  <WorkspaceCreateDialog v-model:open="isCreateDialogOpen" />
</template>
