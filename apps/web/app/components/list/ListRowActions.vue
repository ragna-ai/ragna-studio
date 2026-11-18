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

/** A hovered row is already `surface-subtle`, so the buttons in it lift to the page background with an outline that stays while the menu is open. */
const rowButtonClass =
  'border border-transparent hover:border-border hover:bg-background data-[state=open]:border-border data-[state=open]:bg-background';
</script>

<template>
  <div class="flex items-center justify-end gap-1" @click.stop>
    <TooltipProvider>
      <Tooltip v-if="primaryAction">
        <TooltipTrigger as-child>
          <Button
            variant="ghost"
            :class="rowButtonClass"
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
          :class="rowButtonClass"
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
