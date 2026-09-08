<script setup lang="ts">
import {
  splitForHighlight,
  stripMarkup,
} from '~/features/chat/lib/chat-search-highlight';

// Props
interface Props {
  text: string;
  query: string;
}
const props = defineProps<Props>();

// Computed
const segments = computed(() =>
  splitForHighlight(stripMarkup(props.text), props.query),
);
</script>

<template>
  <span>
    <template v-for="(segment, index) in segments" :key="index">
      <mark
        v-if="segment.matched"
        class="rounded-sm bg-yellow-200 px-0.5 text-foreground dark:bg-yellow-900"
        >{{ segment.text }}</mark
      >
      <template v-else>{{ segment.text }}</template>
    </template>
  </span>
</template>
