<script setup lang="ts">
import TaskCreateForm from '~/features/task/components/TaskCreateForm.vue';
import type { TaskStatus } from '~/features/task/types';

interface TaskCreateDialogProps {
  status?: TaskStatus;
}

// Props
withDefaults(defineProps<TaskCreateDialogProps>(), {
  status: 'backlog',
});

// Emits
const emit = defineEmits<{ 'manage-labels': [] }>();

// Models
const open = defineModel<boolean>('open', { default: false });

// Composables
const { t } = useI18n();
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="top-[20%] translate-y-0 gap-0 sm:max-w-xl">
      <DialogTitle class="text-small font-medium text-muted-foreground">
        {{ t('task.createDialog.title') }}
      </DialogTitle>
      <TaskCreateForm
        :status="status"
        @created="open = false"
        @manage-labels="emit('manage-labels')"
      />
    </DialogContent>
  </Dialog>
</template>
