<script setup lang="ts">
import { Button } from '~/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '~/components/ui/tooltip';

interface PrimaryAction {
  icon: `hugeicons:${string}`;
  label: string;
}

interface ListRowActionsProps {
  primaryAction?: PrimaryAction;
}

defineProps<ListRowActionsProps>();

const emit = defineEmits<{
  (e: 'primary'): void;
}>();

const { t } = useI18n();
</script>

<template>
  <div class="flex items-center justify-end gap-1" @click.stop>
    <TooltipProvider>
      <Tooltip v-if="primaryAction">
        <TooltipTrigger as-child>
          <Button
            variant="ghost"
            size="icon-sm"
            :leading-icon="primaryAction.icon"
            :aria-label="primaryAction.label"
            @click="emit('primary')"
          />
        </TooltipTrigger>
        <TooltipContent>{{ primaryAction.label }}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
    <DropdownMenu>
      <DropdownMenuTrigger as-child>
        <Button
          variant="ghost"
          size="icon-sm"
          leading-icon="hugeicons:more-vertical"
          :aria-label="t('common.actions')"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" size="sm">
        <slot />
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
</template>
