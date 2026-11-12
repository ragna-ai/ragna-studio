<script setup lang="ts">
import PickerRow from '~/components/PickerRow.vue';
import { Button } from '~/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';

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
        <Icon name="hugeicons:plus-sign" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent side="top" align="start" :side-offset="8" class="w-90">
      <DropdownMenuItem @select="emit('addFiles')">
        <PickerRow
          :title="t('chat.input.attach')"
          :hint="t('chat.input.attachHint')"
        >
          <template #lead>
            <Icon name="hugeicons:attachment-01" class="size-4 shrink-0" />
          </template>
        </PickerRow>
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
