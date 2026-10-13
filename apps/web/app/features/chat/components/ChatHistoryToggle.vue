<script setup lang="ts">
import { HistoryIcon } from '@lucide/vue';
import { Button } from '~/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '~/components/ui/tooltip';
import { useSidePanelStore } from '~/stores/sidepanel.store';

// Composables
const sidePanel = useSidePanelStore();
const { t } = useI18n();
</script>

<template>
  <TooltipProvider :delay-duration="300">
    <Tooltip>
      <TooltipTrigger as-child>
        <Button
          variant="ghost"
          size="icon"
          :aria-label="t('chat.history.toggle')"
          @click.stop="sidePanel.toggle('chat-history')"
        >
          <HistoryIcon class="size-4 stroke-1.5 opacity-75" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">
        {{ t('chat.history.toggle') }}
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
</template>
