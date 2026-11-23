<script setup lang="ts">
import TaskCommentForm from '~/features/task/components/TaskCommentForm.vue';
import { useCreateTaskComment } from '~/features/task/composables/useTaskCommentApi';

// Props
interface Props {
  taskId: string;
}

const props = defineProps<Props>();

// Refs
// Bumped after a post so the form remounts with an empty editor.
const formKey = ref(0);

// Composables
const { t } = useI18n();
const { mutate: createComment, isPending } = useCreateTaskComment(
  () => props.taskId,
);

// Functions
function post(body: string) {
  createComment(
    { body },
    {
      onSuccess: () => {
        formKey.value += 1;
      },
    },
  );
}
</script>

<template>
  <TaskCommentForm
    :key="formKey"
    :submit-label="t('task.comment.post')"
    :is-pending="isPending"
    @submit="post"
  />
</template>
