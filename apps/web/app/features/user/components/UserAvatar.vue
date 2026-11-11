<script setup lang="ts">
// Imports
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { AvatarVariants } from '@/components/ui/avatar';
import type { HTMLAttributes } from 'vue';

// Props
interface Props {
  userName: string;
  imageUrl?: string;
  size?: AvatarVariants['size'];
  class?: HTMLAttributes['class'];
}

const props = defineProps<Props>();

// Computed
const initials = computed(() => {
  return props.userName
    ? props.userName
        .split(' ')
        .map((n) => n[0])
        .join('')
    : 'U';
});
</script>

<template>
  <Avatar :size="size" :class="props.class">
    <AvatarImage v-if="imageUrl" :src="imageUrl" :alt="userName" />
    <AvatarFallback>
      {{ initials }}
    </AvatarFallback>
  </Avatar>
</template>
