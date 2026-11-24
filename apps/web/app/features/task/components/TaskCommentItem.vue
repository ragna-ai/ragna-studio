<script setup lang="ts">
import { Button } from '~/components/ui/button';
import MessageResponse from '~/components/ai-elements/message/MessageResponse.vue';
import TaskCommentAuthorMark from '~/features/task/components/TaskCommentAuthorMark.vue';
import TaskCommentForm from '~/features/task/components/TaskCommentForm.vue';
import {
  useDeleteTaskComment,
  useUpdateTaskComment,
} from '~/features/task/composables/useTaskCommentApi';
import { useTaskRunHighlight } from '~/features/task/composables/useTaskRunHighlight';
import type { TaskComment } from '~/features/task/types';

// Props
interface Props {
  comment: TaskComment;
}

const props = defineProps<Props>();

// Refs
const isEditing = ref(false);

// Composables
const { t } = useI18n();
const { confirm } = useConfirmDialog();
const { formatRelative } = useDateTimeFormat();
const { highlightRun } = useTaskRunHighlight();
const { mutate: updateComment, isPending: isSaving } = useUpdateTaskComment(
  () => props.comment.taskId,
);
const { mutate: deleteComment } = useDeleteTaskComment(
  () => props.comment.taskId,
);

// Computed
const displayName = computed(() => {
  const { author } = props.comment;
  if (author.name) {
    return author.name;
  }
  return author.kind === 'agent'
    ? t('task.comment.deletedAgent')
    : t('task.comment.deletedUser');
});
const hasActions = computed(
  () => props.comment.canEdit || props.comment.canDelete,
);

// Functions
function save(body: string) {
  updateComment(
    { commentId: props.comment.id, body },
    {
      onSuccess: () => {
        isEditing.value = false;
      },
    },
  );
}

async function remove() {
  const confirmed = await confirm({
    title: t('task.comment.deleteConfirmTitle'),
    message: t('task.comment.deleteConfirmMessage'),
    confirmLabel: t('common.delete'),
    cancelLabel: t('common.cancel'),
    variant: 'destructive',
  });
  if (!confirmed) {
    return;
  }
  deleteComment(props.comment.id);
}
</script>

<template>
  <li class="flex gap-3" data-testid="task-comment">
    <TaskCommentAuthorMark
      :author="comment.author"
      :display-name="displayName"
    />
    <div class="flex min-w-0 flex-1 flex-col gap-1">
      <div class="flex flex-wrap items-center gap-x-2 text-xs">
        <span class="text-sm font-medium">{{ displayName }}</span>
        <time class="text-muted-foreground" :datetime="comment.createdAt">
          {{ formatRelative(comment.createdAt) }}
        </time>
        <Button
          v-if="comment.taskRunId"
          type="button"
          variant="link"
          class="h-auto p-0 text-xs text-muted-foreground"
          @click="highlightRun(comment.taskRunId)"
        >
          {{ t('task.run.fromRun') }}
        </Button>
        <span v-if="comment.editedAt" class="text-muted-foreground">
          {{ t('task.comment.edited') }}
        </span>
        <div v-if="hasActions && !isEditing" class="ml-auto flex gap-1">
          <Button
            v-if="comment.canEdit"
            type="button"
            variant="ghost"
            size="sm"
            @click="isEditing = true"
          >
            {{ t('common.edit') }}
          </Button>
          <Button
            v-if="comment.canDelete"
            type="button"
            variant="ghost"
            size="sm"
            @click="remove"
          >
            {{ t('common.delete') }}
          </Button>
        </div>
      </div>
      <TaskCommentForm
        v-if="isEditing"
        :initial-body="comment.body"
        :submit-label="t('common.save')"
        :is-pending="isSaving"
        is-cancellable
        @submit="save"
        @cancel="isEditing = false"
      />
      <MessageResponse v-else :content="comment.body" class="text-sm" />
    </div>
  </li>
</template>
