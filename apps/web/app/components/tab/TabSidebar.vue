<script setup lang="ts">
interface Tab {
  id: string;
  icon: any;
  label: string;
}

interface Props {
  tabs: Tab[];
  modelValue: string; // for v-model support
  errorTabs?: string[];
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
}>();

const activeTab = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
});
</script>

<template>
  <div class="grid grid-cols-12">
    <!-- Tab list -->
    <div role="tablist" class="col-span-3">
      <ul class="space-y-2">
        <li v-for="tab in tabs" :key="tab.id">
          <button
            type="button"
            role="tab"
            :aria-selected="activeTab === tab.id"
            :aria-controls="`panel-${tab.id}`"
            :class="{
              'shadow-sm': activeTab === tab.id,
              'border-transparent hover:bg-gray-100': activeTab !== tab.id,
              'border-destructive!': errorTabs?.includes(tab.id),
            }"
            class="flex w-full items-center space-x-2 rounded-md border px-4 py-2 text-left transition"
            @click="activeTab = tab.id"
          >
            <component :is="tab.icon" class="size-4 stroke-1.5" />
            <span class="text-sm">{{ tab.label }}</span>
          </button>
        </li>
      </ul>
    </div>
    <!-- Tab panels -->
    <div class="col-span-9 pl-32">
      <template v-for="tab in tabs" :key="tab.id">
        <div
          :id="`panel-${tab.id}`"
          role="tabpanel"
          :aria-labelledby="tab.id"
          :class="{
            hidden: activeTab !== tab.id,
            block: activeTab === tab.id,
          }"
        >
          <slot :name="tab.id" />
        </div>
      </template>
    </div>
  </div>
</template>
