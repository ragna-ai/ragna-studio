<script setup lang="ts">
import WorkspaceCreateDialog from '~/features/workspace/components/WorkspaceCreateDialog.vue';

// Refs
const isCreateDialogOpen = ref(false);

// Composables
const { t } = useI18n();
</script>

<template>
  <div
    class="flex h-full flex-col items-center justify-center gap-3 p-8 text-center"
  >
    <h2 class="text-lg font-medium">{{ t('workspace.emptyState.title') }}</h2>
    <p class="max-w-sm text-sm text-muted-foreground">
      {{ t('workspace.emptyState.description') }}
    </p>
    <Button leading-icon="hugeicons:add-01" @click="isCreateDialogOpen = true">
      {{ t('workspace.emptyState.action') }}
    </Button>
    <WorkspaceCreateDialog v-model:open="isCreateDialogOpen" />
  </div>
</template>
