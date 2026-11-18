<script setup lang="ts">
import { Button } from '~/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '~/components/ui/tooltip';

export type SaveStatus = 'saved' | 'saving' | 'failed';

const STATUS_ICON: Record<SaveStatus, `hugeicons:${string}`> = {
  saved: 'hugeicons:cloud-saving-done-01',
  saving: 'hugeicons:cloud-loading',
  failed: 'hugeicons:cloud-alert',
};

// Props
interface Props {
  status: SaveStatus;
}
defineProps<Props>();

// Emits
interface Emits {
  save: [];
}
const emit = defineEmits<Emits>();

// Composables
const { t } = useI18n();
</script>

<template>
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger as-child>
        <Button
          variant="ghost"
          size="icon"
          :class="status === 'failed' ? 'text-destructive' : 'text-icon'"
          :aria-label="t(`common.saveStatus.${status}`)"
          @click="emit('save')"
        >
          <Icon :name="STATUS_ICON[status]" class="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {{ t(`common.saveStatus.${status}`) }}
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
</template>
