<script setup lang="ts">
import { PlusIcon } from '@lucide/vue';
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
    <Button @click="isCreateDialogOpen = true">
      <PlusIcon class="mr-1 size-4" />
      {{ t('workspace.emptyState.action') }}
    </Button>
    <WorkspaceCreateDialog v-model:open="isCreateDialogOpen" />
  </div>
</template>
