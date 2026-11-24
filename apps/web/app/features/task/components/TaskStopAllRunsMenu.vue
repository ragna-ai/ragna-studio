<script setup lang="ts">
import { useCancelAllTaskRuns } from '~/features/task/composables/useTaskRunApi';
import { useGetWorkspaces } from '~/features/workspace/composables/useWorkspaceApi';
import { canManageWorkspace } from '~/features/workspace/lib/workspace-roles';

// Composables
const { t } = useI18n();
const { confirm } = useConfirmDialog();
const activeWorkspaceId = useActiveWorkspaceId();
const { data: workspacesData } = useGetWorkspaces();
const { mutate: cancelAllRuns } = useCancelAllTaskRuns();

// Computed
const canStopAll = computed(() => {
  const workspace = workspacesData.value?.workspaces.find(
    (candidate) => candidate.id === activeWorkspaceId.value,
  );
  return !!workspace && canManageWorkspace(workspace);
});

// Functions
async function stopAll() {
  const confirmed = await confirm({
    title: t('task.run.stopAllConfirmTitle'),
    message: t('task.run.stopAllConfirmMessage'),
    confirmLabel: t('task.run.stopAll'),
    cancelLabel: t('common.cancel'),
    variant: 'destructive',
  });
  if (!confirmed) {
    return;
  }
  cancelAllRuns();
}
</script>

<template>
  <DropdownMenu v-if="canStopAll">
    <DropdownMenuTrigger as-child>
      <Button
        variant="outline"
        size="icon"
        :aria-label="t('task.list.moreActions')"
      >
        <Icon name="hugeicons:more-horizontal" aria-hidden="true" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem @select="stopAll">
        <Icon name="hugeicons:stop" aria-hidden="true" />
        {{ t('task.run.stopAll') }}
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
