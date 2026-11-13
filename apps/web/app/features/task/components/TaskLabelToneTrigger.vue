<script setup lang="ts">
import type { AgentMarkTone } from '@repo/ai/client';
import ToneSwatchGroup from '~/components/ToneSwatchGroup.vue';
import { TONE_CLASS } from '~/lib/tone';
import { cn } from '~/lib/utils';

// Models
const tone = defineModel<AgentMarkTone>({ required: true });

// Composables
const { t } = useI18n();
const captionId = useId();
</script>

<template>
  <!-- The popover sits inside the tooltip trigger: reka contexts are unscoped, so a PopoverTrigger inside a Tooltip anchors to the tooltip. -->
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger as-child>
        <span class="inline-flex shrink-0">
          <Popover>
            <PopoverTrigger as-child>
              <Button
                type="button"
                variant="outline"
                size="icon"
                :aria-label="t('task.label.colorLabel')"
              >
                <span
                  :class="
                    cn(
                      'flex size-6 items-center justify-center rounded-sm',
                      TONE_CLASS[tone],
                    )
                  "
                >
                  <span
                    class="size-3 rounded-full bg-current"
                    aria-hidden="true"
                  />
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              :side-offset="8"
              class="w-70 p-4"
              @open-auto-focus.prevent
            >
              <span :id="captionId" class="text-caption text-muted-foreground">
                {{ t('task.label.colour') }}
              </span>
              <ToneSwatchGroup
                v-model="tone"
                :ariaLabelledby="captionId"
                class="mt-2"
              />
            </PopoverContent>
          </Popover>
        </span>
      </TooltipTrigger>
      <TooltipContent>{{ t('task.label.colorLabel') }}</TooltipContent>
    </Tooltip>
  </TooltipProvider>
</template>
