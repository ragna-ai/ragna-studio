<script setup lang="ts">
import { PauseIcon } from '@lucide/vue';

// Composables
const { t } = useI18n();
</script>

<template>
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger as-child>
        <Badge variant="outline" class="border-amber-500 text-amber-600">
          <PauseIcon />
          {{ t('workflow.schedulePaused.badge') }}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <p>{{ t('workflow.schedulePaused.reason') }}</p>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
</template>
