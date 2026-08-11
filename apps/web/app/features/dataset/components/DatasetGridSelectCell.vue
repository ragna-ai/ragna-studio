<script setup lang="ts">
// Imports

// Props
interface Props {
  value: string | null;
  options: string[];
  columnName: string;
}

const props = defineProps<Props>();

// Emits
const emit = defineEmits<{
  (e: 'update:value', value: string | null): void;
}>();

// Refs
// `SelectRoot` (via reka-ui) sets up a collection provider, form-control
// detection, and a PopperRoot on mount, even while closed. With up to 20
// select columns x 70 rows that's mounted everywhere at once, so this cell
// stays a plain button until clicked and only then mounts the real Select.
const isEditing = ref(false);

// Composables
const { t } = useI18n();

// Functions
function commitValue(value: unknown) {
  emit('update:value', value === undefined ? null : String(value));
}

function handleOpenChange(open: boolean) {
  if (!open) {
    isEditing.value = false;
  }
}
</script>

<template>
  <Select
    v-if="isEditing"
    :model-value="value ?? undefined"
    default-open
    @update:model-value="commitValue"
    @update:open="handleOpenChange"
  >
    <SelectTrigger class="h-9 w-full">
      <SelectValue :placeholder="t('dataset.grid.selectPlaceholder')" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem v-for="option in options" :key="option" :value="option">
        {{ option }}
      </SelectItem>
    </SelectContent>
  </Select>
  <Button
    v-else
    type="button"
    variant="outline"
    class="h-9 w-full justify-start px-3 font-normal"
    :aria-label="t('dataset.grid.editCell', { column: columnName })"
    @click="isEditing = true"
  >
    <span class="min-w-0 truncate">{{
      props.value ?? t('dataset.grid.selectPlaceholder')
    }}</span>
  </Button>
</template>
