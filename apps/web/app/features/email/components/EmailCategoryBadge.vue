<script setup lang="ts">
import type { EmailCategory } from '~/features/email/types';

const props = defineProps<{ category: EmailCategory }>();
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium"
    :style="{ borderColor: props.category.color, color: props.category.color }"
  >
    <span
      class="size-1.5 shrink-0 rounded-full"
      :style="{ backgroundColor: props.category.color }"
    />
    {{ props.category.name }}
  </span>
</template>
