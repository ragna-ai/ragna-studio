<script setup lang="ts">
import {
  AGENT_MARK_ICONS,
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
import ToneSwatchGroup from '~/components/ToneSwatchGroup.vue';

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
      <ToneSwatchGroup
        v-model="tone"
        ariaLabelledby="agent-mark-colour-label"
      />
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
