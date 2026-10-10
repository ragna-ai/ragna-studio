<script setup lang="ts">
import { LogOutIcon, Trash2Icon } from '@lucide/vue';
import { toast } from 'vue-sonner';
import WorkspaceMemberPicker from '~/features/workspace/components/WorkspaceMemberPicker.vue';
import {
  useAddWorkspaceMember,
  useChangeWorkspaceMemberRole,
  useGetWorkspaceMembers,
  useRemoveWorkspaceMember,
} from '~/features/workspace/composables/useWorkspaceMemberApi';
import {
  canManageWorkspace,
  isWorkspaceRole,
  WORKSPACE_ROLES,
} from '~/features/workspace/lib/workspace-roles';
import type {
  Workspace,
  WorkspaceMember,
  WorkspaceRole,
} from '~/features/workspace/types';
import { extractErrorMessage } from '~/lib/api-error';

interface WorkspaceMembersPanelProps {
  workspace: Workspace;
}

// Props
const props = defineProps<WorkspaceMembersPanelProps>();

// Emits
const emit = defineEmits<{ (e: 'left'): void }>();

// Refs
const selectedUserIds = ref<string[]>([]);
const newMemberRole = ref<WorkspaceRole>('editor');
const isAdding = ref(false);

// Composables
const { t } = useI18n();
const { confirm } = useConfirmDialog();
const session = useAuthSession();
const workspaceId = computed(() => props.workspace.id);
const { data: members, isPending, error } = useGetWorkspaceMembers(workspaceId);
const { mutateAsync: addMember } = useAddWorkspaceMember(workspaceId);
const { mutateAsync: changeRole } = useChangeWorkspaceMemberRole(workspaceId);
const { mutateAsync: removeMember } = useRemoveWorkspaceMember(workspaceId);

// Computed
const isRestricted = computed(
  () => props.workspace.visibility === 'restricted',
);
const canManage = computed(() => canManageWorkspace(props.workspace));
const currentUserId = computed(() => session.value?.user.id);
const memberUserIds = computed(() =>
  (members.value ?? []).map((member) => member.userId),
);
const isCurrentUserMember = computed(
  () =>
    currentUserId.value !== undefined &&
    memberUserIds.value.includes(currentUserId.value),
);

// Functions
function roleLabel(role: WorkspaceRole): string {
  return t(`workspace.roles.${role}`);
}

function isCurrentUser(member: WorkspaceMember): boolean {
  return member.userId === currentUserId.value;
}

async function handleAdd() {
  // Organization workspaces are open to everyone, so only managers are added.
  const role = isRestricted.value ? newMemberRole.value : 'manager';
  isAdding.value = true;
  try {
    for (const userId of selectedUserIds.value) {
      await addMember({ userId, workspaceRole: role });
    }
    selectedUserIds.value = [];
    toast.success(t('workspace.members.added'));
  } catch (err) {
    toast.error(extractErrorMessage(err, t('workspace.members.addError')));
  } finally {
    isAdding.value = false;
  }
}

async function handleChangeRole(member: WorkspaceMember, role: unknown) {
  if (!isWorkspaceRole(role)) return;
  try {
    await changeRole({ userId: member.userId, workspaceRole: role });
    toast.success(t('workspace.members.roleChanged'));
  } catch (err) {
    toast.error(extractErrorMessage(err, t('workspace.members.roleError')));
  }
}

async function handleRemove(member: WorkspaceMember) {
  const confirmed = await confirm({
    title: t('workspace.members.removeConfirm.title', { name: member.name }),
    message: t('workspace.members.removeConfirm.message'),
    confirmLabel: t('workspace.members.remove'),
    cancelLabel: t('common.cancel'),
    variant: 'destructive',
  });
  if (!confirmed) return;
  try {
    await removeMember(member.userId);
    toast.success(t('workspace.members.removed'));
  } catch (err) {
    toast.error(extractErrorMessage(err, t('workspace.members.removeError')));
  }
}

async function handleLeave() {
  const userId = currentUserId.value;
  if (!userId) return;
  const confirmed = await confirm({
    title: t('workspace.members.leaveConfirm.title', {
      name: props.workspace.name,
    }),
    message: t('workspace.members.leaveConfirm.message'),
    confirmLabel: t('workspace.members.leave'),
    cancelLabel: t('common.cancel'),
    variant: 'destructive',
  });
  if (!confirmed) return;
  try {
    await removeMember(userId);
    toast.success(t('workspace.members.left'));
    emit('left');
  } catch (err) {
    toast.error(extractErrorMessage(err, t('workspace.members.leaveError')));
  }
}
</script>

<template>
  <div class="space-y-4">
    <h3 class="text-sm font-medium">
      {{
        isRestricted
          ? t('workspace.members.title')
          : t('workspace.members.managersTitle')
      }}
    </h3>

    <Skeleton v-if="isPending" class="h-20 w-full" />
    <p v-else-if="error" class="text-sm text-destructive">
      {{ t('workspace.members.loadError') }}
    </p>
    <ul v-else class="max-h-56 divide-y overflow-y-auto">
      <li
        v-for="member in members"
        :key="member.userId"
        class="flex items-center justify-between gap-3 py-2"
      >
        <div class="min-w-0">
          <p class="truncate text-sm font-medium">{{ member.name }}</p>
          <p class="truncate text-xs text-muted-foreground">
            {{ member.email }}
          </p>
        </div>
        <div class="flex shrink-0 items-center gap-1">
          <Select
            v-if="canManage && isRestricted"
            :model-value="member.workspaceRole"
            @update:model-value="(role) => handleChangeRole(member, role)"
          >
            <SelectTrigger class="h-8 w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="role in WORKSPACE_ROLES"
                :key="role"
                :value="role"
              >
                {{ roleLabel(role) }}
              </SelectItem>
            </SelectContent>
          </Select>
          <Badge v-else variant="secondary">{{
            roleLabel(member.workspaceRole)
          }}</Badge>
          <Button
            v-if="canManage && !isCurrentUser(member)"
            variant="ghost"
            size="icon"
            :aria-label="t('workspace.members.remove')"
            @click="handleRemove(member)"
          >
            <Trash2Icon class="size-4" />
          </Button>
        </div>
      </li>
    </ul>

    <div v-if="canManage" class="space-y-2">
      <Label>{{
        isRestricted
          ? t('workspace.members.addTitle')
          : t('workspace.members.addManagerTitle')
      }}</Label>
      <WorkspaceMemberPicker
        v-model="selectedUserIds"
        :excluded-user-ids="memberUserIds"
      />
      <div class="flex items-center justify-end gap-2">
        <Select
          v-if="isRestricted"
          :model-value="newMemberRole"
          @update:model-value="
            (role) => isWorkspaceRole(role) && (newMemberRole = role)
          "
        >
          <SelectTrigger class="h-8 w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              v-for="role in WORKSPACE_ROLES"
              :key="role"
              :value="role"
            >
              {{ roleLabel(role) }}
            </SelectItem>
          </SelectContent>
        </Select>
        <Button
          size="sm"
          :disabled="selectedUserIds.length === 0 || isAdding"
          @click="handleAdd"
        >
          <Spinner v-if="isAdding" class="mr-2" />
          {{ t('workspace.members.add') }}
        </Button>
      </div>
    </div>

    <Button
      v-if="isCurrentUserMember"
      variant="outline"
      size="sm"
      @click="handleLeave"
    >
      <LogOutIcon class="mr-1 size-4" />
      {{ t('workspace.members.leave') }}
    </Button>
  </div>
</template>
