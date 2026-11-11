<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { cn } from '@/lib/utils';

const props = defineProps<{
  class?: HTMLAttributes['class'];
}>();
</script>

<template>
  <Icon
    name="hugeicons:loading-03"
    role="status"
    :aria-label="$t('common.loading')"
    :class="cn('size-4 text-icon motion-safe:animate-spin', props.class)"
  />
</template>
