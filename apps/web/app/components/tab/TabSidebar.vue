<script setup lang="ts">
import { cn } from '~/lib/utils';

interface Tab {
  id: string;
  /** Hugeicons name, e.g. `hugeicons:user`. */
  icon: string;
  label: string;
}

interface Props {
  tabs: Tab[];
  errorTabs?: string[];
}

// Props
defineProps<Props>();

// Refs
const activeTab = defineModel<string>({ required: true });
</script>

<template>
  <div
    class="grid min-h-0 flex-1 grid-cols-[12.5rem_minmax(0,1fr)] grid-rows-[minmax(0,1fr)] gap-12"
  >
    <!-- Tab list -->
    <div role="tablist" aria-orientation="vertical">
      <ul class="flex flex-col gap-1">
        <li v-for="tab in tabs" :key="tab.id">
          <button
            type="button"
            role="tab"
            :aria-selected="activeTab === tab.id"
            :aria-controls="`panel-${tab.id}`"
            :class="
              cn(
                'flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                activeTab === tab.id
                  ? 'bg-selected font-medium'
                  : 'hover:bg-surface-subtle',
              )
            "
            @click="activeTab = tab.id"
          >
            <Icon :name="tab.icon" class="size-4 shrink-0 text-icon" />
            <span>{{ tab.label }}</span>
            <template v-if="errorTabs?.includes(tab.id)">
              <span class="ml-auto size-1.5 rounded-full bg-destructive" />
              <span class="sr-only">{{ $t('common.hasErrors') }}</span>
            </template>
          </button>
        </li>
      </ul>
    </div>
    <!-- Tab panels -->
    <div class="flex min-h-0 flex-col">
      <template v-for="tab in tabs" :key="tab.id">
        <div
          :id="`panel-${tab.id}`"
          role="tabpanel"
          :aria-labelledby="tab.id"
          :class="
            activeTab === tab.id
              ? '-m-1 flex min-h-0 flex-1 flex-col overflow-y-auto p-1'
              : 'hidden'
          "
        >
          <div class="flex w-full max-w-160 flex-col gap-8">
            <slot :name="tab.id" />
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
