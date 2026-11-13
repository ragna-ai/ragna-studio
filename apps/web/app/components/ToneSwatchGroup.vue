<script setup lang="ts">
import { AGENT_MARK_TONES, type AgentMarkTone } from '@repo/ai/client';
import { TONE_CLASS } from '~/lib/tone';
import { cn } from '~/lib/utils';

// Props
defineProps<{ ariaLabelledby: string }>();

// Models
const tone = defineModel<AgentMarkTone>({ required: true });

// Composables
const { t } = useI18n();
</script>

<template>
  <div role="radiogroup" :aria-labelledby="ariaLabelledby" class="flex gap-2">
    <button
      v-for="option in AGENT_MARK_TONES"
      :key="option"
      type="button"
      role="radio"
      :aria-checked="option === tone"
      :aria-label="t(`agent.mark.tones.${option}`)"
      :data-tone="option"
      :class="
        cn(
          'flex size-6 shrink-0 items-center justify-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          TONE_CLASS[option],
          option === tone &&
            'ring-2 ring-foreground ring-offset-2 ring-offset-background',
        )
      "
      @click="tone = option"
    >
      <span class="size-3 rounded-full bg-current" aria-hidden="true" />
    </button>
  </div>
</template>
