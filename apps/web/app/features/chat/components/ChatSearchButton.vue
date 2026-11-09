<script setup lang="ts">
import { Button } from '~/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '~/components/ui/tooltip';

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
            <Icon name="hugeicons:search-01" class="size-4 text-icon" />
          </NuxtLinkLocale>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {{ t('chat.search.title') }}
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
</template>
