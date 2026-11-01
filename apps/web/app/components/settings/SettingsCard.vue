<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { Card } from '~/components/ui/card';
import { cn } from '~/lib/utils';

interface SettingsCardProps {
  class?: HTMLAttributes['class'];
}

const props = withDefaults(defineProps<SettingsCardProps>(), {
  class: undefined,
});
</script>

<template>
  <Card :class="cn('shadow-none', props.class)">
    <slot />
  </Card>
</template>
