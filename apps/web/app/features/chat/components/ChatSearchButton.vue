<script setup lang="ts">
import { SearchIcon } from '@lucide/vue';
import { Button } from '~/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '~/components/ui/tooltip';

// Composables
const { t } = useI18n();
</script>

<template>
  <TooltipProvider :delay-duration="300">
    <Tooltip>
      <TooltipTrigger as-child>
        <Button
          as-child
          variant="ghost"
          size="icon"
          :aria-label="t('chat.search.title')"
        >
          <NuxtLinkLocale to="/chat/search">
            <SearchIcon class="size-4 stroke-1.5 opacity-75" />
          </NuxtLinkLocale>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">
        {{ t('chat.search.title') }}
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
</template>
