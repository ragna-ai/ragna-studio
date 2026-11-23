<script setup lang="ts">
// Imports
import { Avatar, AvatarFallback } from '~/components/ui/avatar';
import type { AvatarVariants } from '~/components/ui/avatar';
import { createInitials } from '~/lib/utils';
import type { HTMLAttributes } from 'vue';

// Props
interface Props {
  userName: string;
  size?: AvatarVariants['size'];
  class?: HTMLAttributes['class'];
}

const props = defineProps<Props>();

// Computed
const initials = computed(() => createInitials(props.userName));
</script>

<template>
  <Avatar :size="size" :class="props.class">
    <AvatarFallback
      class="bg-border-strong text-caption font-medium text-foreground"
    >
      {{ initials }}
    </AvatarFallback>
  </Avatar>
</template>
