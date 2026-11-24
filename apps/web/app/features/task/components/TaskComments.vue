<script setup lang="ts">
import TaskCommentComposer from '~/features/task/components/TaskCommentComposer.vue';
import TaskCommentItem from '~/features/task/components/TaskCommentItem.vue';
import { useGetTaskComments } from '~/features/task/composables/useTaskCommentApi';

// Props
interface Props {
  taskId: string;
}

const props = defineProps<Props>();

// Composables
const { t } = useI18n();
const { data, isError } = useGetTaskComments(() => props.taskId);

// Computed
const newestFirstComments = computed(() =>
  (data.value?.comments ?? []).toReversed(),
);
</script>

<template>
  <section class="space-y-3" :aria-label="t('task.comment.title')">
    <p class="text-sm font-semibold">{{ t('task.comment.title') }}</p>
    <TaskCommentComposer :task-id="taskId" />
    <p v-if="isError" class="text-sm text-muted-foreground">
      {{ t('task.comment.loadError') }}
    </p>
    <p
      v-else-if="newestFirstComments.length === 0"
      class="text-sm text-muted-foreground"
    >
      {{ t('task.comment.empty') }}
    </p>
    <ul v-else class="flex flex-col gap-4">
      <TaskCommentItem
        v-for="comment in newestFirstComments"
        :key="comment.id"
        :comment="comment"
      />
    </ul>
  </section>
</template>
