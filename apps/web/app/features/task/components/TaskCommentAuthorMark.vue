<script setup lang="ts">
import AgentMark from '~/features/agent/components/AgentMark.vue';
import UserAvatar from '~/features/user/components/UserAvatar.vue';
import type { TaskCommentAuthor } from '~/features/task/types';

// Props
interface Props {
  author: TaskCommentAuthor;
  displayName: string;
}

defineProps<Props>();
</script>

<template>
  <AgentMark
    v-if="author.kind === 'agent'"
    :agent-id="author.id ?? undefined"
    :icon="author.icon"
    :tone="author.tone"
    :size="24"
  />
  <UserAvatar v-else :user-name="displayName" size="sm" />
</template>
