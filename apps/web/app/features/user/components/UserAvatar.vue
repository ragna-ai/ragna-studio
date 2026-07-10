<script setup lang="ts">
// Imports
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import type { HTMLAttributes } from 'vue';

// Props
interface Props {
  userName: string;
  imageUrl?: string;
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
  <Avatar :class="cn('size-8 shrink-0 rounded-full grayscale', props.class)">
    <AvatarImage
      v-if="imageUrl"
      :src="imageUrl"
      :alt="userName"
      class="rounded-full"
    />
    <AvatarFallback
      class="rounded-full border border-foreground/40 text-foreground text-sm"
    >
      {{ initials }}
    </AvatarFallback>
  </Avatar>
</template>
