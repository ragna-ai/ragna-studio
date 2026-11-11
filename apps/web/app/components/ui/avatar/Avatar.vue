<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { AvatarRoot } from 'reka-ui';
import { cn } from '@/lib/utils';
import { avatarVariants, type AvatarVariants } from '.';

const props = defineProps<{
  class?: HTMLAttributes['class'];
  size?: AvatarVariants['size'];
}>();
</script>

<template>
  <AvatarRoot
    data-slot="avatar"
    :data-size="props.size ?? 'default'"
    :class="cn(avatarVariants({ size: props.size }), props.class)"
  >
    <slot />
  </AvatarRoot>
</template>
