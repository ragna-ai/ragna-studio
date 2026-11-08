<script setup lang="ts">
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
  <Icon
    v-if="visibility === 'personal'"
    name="hugeicons:user-lock-01"
    :title="t('workspace.visibilityHint.personal')"
    :aria-label="t('workspace.visibilityHint.personal')"
  />
  <Icon
    v-else-if="visibility === 'restricted'"
    name="hugeicons:lock"
    :title="t('workspace.visibilityHint.restricted')"
    :aria-label="t('workspace.visibilityHint.restricted')"
  />
</template>
