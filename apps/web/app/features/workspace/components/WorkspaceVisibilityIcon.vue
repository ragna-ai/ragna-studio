<script setup lang="ts">
import { LockIcon, UserLockIcon } from '@lucide/vue';
import type { WorkspaceVisibility } from '~/features/workspace/types';

interface WorkspaceVisibilityIconProps {
  visibility: WorkspaceVisibility;
}

// Props
defineProps<WorkspaceVisibilityIconProps>();

// Composables
const { t } = useI18n();
</script>

<template>
  <UserLockIcon
    v-if="visibility === 'personal'"
    :title="t('workspace.visibilityHint.personal')"
    :aria-label="t('workspace.visibilityHint.personal')"
  />
  <LockIcon
    v-else-if="visibility === 'restricted'"
    :title="t('workspace.visibilityHint.restricted')"
    :aria-label="t('workspace.visibilityHint.restricted')"
  />
</template>
