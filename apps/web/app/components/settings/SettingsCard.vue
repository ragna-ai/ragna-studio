<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { Card } from '~/components/ui/card';

interface SettingsCardProps {
  class?: HTMLAttributes['class'];
}

const props = withDefaults(defineProps<SettingsCardProps>(), {
  class: undefined,
});
</script>

<template>
  <Card :class="props.class">
    <slot />
  </Card>
</template>
