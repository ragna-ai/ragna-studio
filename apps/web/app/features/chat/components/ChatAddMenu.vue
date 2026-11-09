<script setup lang="ts">
import { Button } from '~/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { MENU_CONTENT_CLASS, MENU_ROW_CLASS } from '~/lib/menu-row';
import { cn } from '~/lib/utils';

const emit = defineEmits<{
  addFiles: [];
}>();

const { t } = useI18n();
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button
        variant="ghost"
        size="icon"
        :title="t('chat.input.menu')"
        :aria-label="t('chat.input.menu')"
        class="text-icon"
      >
        <Icon name="hugeicons:plus-sign" class="size-4" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent
      side="top"
      align="start"
      :side-offset="8"
      :class="cn(MENU_CONTENT_CLASS, 'rounded-lg')"
    >
      <DropdownMenuItem
        :class="cn(MENU_ROW_CLASS, 'h-11')"
        @select="emit('addFiles')"
      >
        <Icon name="hugeicons:attachment-01" class="size-4 text-foreground" />
        <span class="flex min-w-0 flex-col">
          <span class="text-small font-medium">{{
            t('chat.input.attach')
          }}</span>
          <span class="text-caption text-muted-foreground">
            {{ t('chat.input.attachHint') }}
          </span>
        </span>
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
