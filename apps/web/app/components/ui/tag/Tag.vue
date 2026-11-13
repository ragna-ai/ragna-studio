<script setup lang="ts">
import type { AgentMarkTone } from '@repo/ai/client';
import type { HTMLAttributes } from 'vue';
import { TONE_DOT_CLASS } from '~/lib/tone';
import { cn } from '~/lib/utils';

interface TagProps {
  tone?: 'neutral' | AgentMarkTone;
  class?: HTMLAttributes['class'];
}

const props = withDefaults(defineProps<TagProps>(), { tone: 'neutral' });
</script>

<template>
  <span
    data-slot="tag"
    :data-tone="tone"
    :class="
      cn(
        'inline-flex h-5.5 shrink-0 items-center gap-1.5 rounded-sm px-2 text-caption whitespace-nowrap',
        tone === 'neutral'
          ? 'bg-chip text-chip-foreground'
          : 'bg-transparent text-chip-foreground inset-ring inset-ring-border',
        props.class,
      )
    "
  >
    <span
      v-if="tone !== 'neutral'"
      :class="cn('size-1.5 rounded-full', TONE_DOT_CLASS[tone])"
      aria-hidden="true"
    />
    <slot />
  </span>
</template>
