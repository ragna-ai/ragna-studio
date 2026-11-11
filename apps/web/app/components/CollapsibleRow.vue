<script setup lang="ts">
import { CollapsibleTrigger } from '~/components/ui/collapsible';

interface CollapsibleRowProps {
  label: string;
  hint?: string;
}

defineProps<CollapsibleRowProps>();
</script>

<template>
  <CollapsibleTrigger as-child>
    <button
      type="button"
      class="group/row -mx-2 flex h-8 items-center gap-2 rounded-md px-2 text-left outline-none hover:bg-surface-subtle focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <Icon
        name="hugeicons:arrow-right-01"
        class="size-4 shrink-0 text-icon group-data-[state=open]/row:hidden"
      />
      <Icon
        name="hugeicons:arrow-down-01"
        class="hidden size-4 shrink-0 text-icon group-data-[state=open]/row:block"
      />
      <span class="text-small font-medium">{{ label }}</span>
      <span v-if="hint" class="truncate text-small text-muted-foreground">
        {{ hint }}
      </span>
    </button>
  </CollapsibleTrigger>
</template>
