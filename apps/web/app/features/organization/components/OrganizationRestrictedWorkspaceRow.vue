<script setup lang="ts">
import { LockIcon } from '@lucide/vue';
import { toast } from 'vue-sonner';
import { useAddWorkspaceMember } from '~/features/workspace/composables/useWorkspaceMemberApi';
import { useWorkspaceScopeStore } from '~/features/workspace/stores/workspacescope.store';
import type { RestrictedWorkspace } from '~/features/workspace/types';
import { extractErrorMessage } from '~/lib/api-error';

interface OrganizationRestrictedWorkspaceRowProps {
  workspace: RestrictedWorkspace;
}

// Props
const props = defineProps<OrganizationRestrictedWorkspaceRowProps>();

// Composables
const { t } = useI18n();
const session = useAuthSession();
const { selectWorkspace } = useWorkspaceScopeStore();
const workspaceId = computed(() => props.workspace.id);
const { mutateAsync: addMember, isPending: isJoining } =
  useAddWorkspaceMember(workspaceId);

// Functions
function openWorkspace() {
  selectWorkspace(props.workspace.id);
  return navigateTo('/');
}

// The workspace list only holds restricted workspaces the caller belongs to,
// so an owner or admin joins as manager before opening one.
async function joinAsManager() {
  const userId = session.value?.user.id;
  if (!userId) return;
  try {
    await addMember({ userId, workspaceRole: 'manager' });
    toast.success(t('organization.workspaces.joined'));
  } catch (err) {
    toast.error(
      extractErrorMessage(err, t('organization.workspaces.joinError')),
    );
  }
}
</script>

<template>
  <li class="flex items-center justify-between gap-4 py-3">
    <div class="flex min-w-0 items-center gap-2">
      <LockIcon class="size-3.5 shrink-0 text-muted-foreground" />
      <div class="min-w-0">
        <p class="truncate text-sm font-medium">{{ workspace.name }}</p>
        <p class="text-xs text-muted-foreground">
          {{
            t('organization.workspaces.memberCount', {
              count: workspace.memberCount,
            })
          }}
        </p>
      </div>
    </div>
    <div class="flex shrink-0 items-center gap-2">
      <Badge v-if="workspace.isWorkspaceMember" variant="secondary">
        {{ t('organization.workspaces.youAreMember') }}
      </Badge>
      <Button
        v-if="workspace.isWorkspaceMember"
        variant="outline"
        size="sm"
        @click="openWorkspace"
      >
        {{ t('organization.workspaces.open') }}
      </Button>
      <Button
        v-else
        variant="outline"
        size="sm"
        :disabled="isJoining"
        @click="joinAsManager"
      >
        <Spinner v-if="isJoining" class="mr-2" />
        {{ t('organization.workspaces.join') }}
      </Button>
    </div>
  </li>
</template>
