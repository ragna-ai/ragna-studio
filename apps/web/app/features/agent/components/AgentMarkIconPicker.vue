<script setup lang="ts">
import {
  AGENT_MARK_ICONS,
  AGENT_MARK_TONES,
  type AgentMarkIcon,
  type AgentMarkTone,
} from '@repo/ai/client';
import { Button } from '~/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '~/components/ui/tooltip';
import { AGENT_TONE_CLASS } from '~/features/agent/lib/agent-tone';
import { cn } from '~/lib/utils';

// Models
const icon = defineModel<AgentMarkIcon>('icon', { required: true });
const tone = defineModel<AgentMarkTone>('tone', { required: true });

// Composables
const { t } = useI18n();
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-col gap-2">
      <span
        id="agent-mark-colour-label"
        class="text-caption text-muted-foreground"
      >
        {{ t('agent.mark.colour') }}
      </span>
      <div
        role="radiogroup"
        aria-labelledby="agent-mark-colour-label"
        class="flex gap-2"
      >
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
              AGENT_TONE_CLASS[option],
              option === tone &&
                'ring-2 ring-foreground ring-offset-2 ring-offset-background',
            )
          "
          @click="tone = option"
        >
          <span class="size-3 rounded-full bg-current" aria-hidden="true" />
        </button>
      </div>
    </div>
    <div class="flex flex-col gap-2">
      <span
        id="agent-mark-icon-label"
        class="text-caption text-muted-foreground"
      >
        {{ t('agent.mark.icon') }}
      </span>
      <TooltipProvider :delay-duration="300">
        <div
          role="radiogroup"
          aria-labelledby="agent-mark-icon-label"
          class="grid grid-cols-7 gap-1"
        >
          <Tooltip v-for="option in AGENT_MARK_ICONS" :key="option">
            <TooltipTrigger as-child>
              <Button
                type="button"
                role="radio"
                variant="ghost"
                size="icon"
                :aria-checked="option === icon"
                :aria-label="t(`agent.mark.icons.${option}`)"
                :data-icon="option"
                :class="
                  option === icon ? 'bg-selected text-foreground' : 'text-icon'
                "
                @click="icon = option"
              >
                <Icon :name="`hugeicons:${option}`" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{{
              t(`agent.mark.icons.${option}`)
            }}</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    </div>
  </div>
</template>
