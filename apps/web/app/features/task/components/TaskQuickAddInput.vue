<script setup lang="ts">
import { PlusIcon } from '@lucide/vue';

// A bare title-only quick-add row, shared by the board's per-column
// composer and the subtask list's quick-add (docs/tasks/prd.md). The
// caller supplies the rest of the create payload (status/parentTaskId).

// Props
const props = withDefaults(
  defineProps<{ placeholder: string; pending?: boolean }>(),
  { pending: false },
);

// Emits
const emit = defineEmits<{ create: [title: string] }>();

// Refs
const title = ref('');

// Functions
function submit() {
  const trimmed = title.value.trim();
  if (!trimmed || props.pending) {
    return;
  }
  emit('create', trimmed);
  title.value = '';
}
</script>

<template>
  <form class="flex items-center gap-2" @submit.prevent.stop="submit">
    <Input
      v-model="title"
      :placeholder="props.placeholder"
      autocomplete="off"
      class="h-8 flex-1 border-0 text-sm shadow-none"
    />
    <Button
      type="submit"
      size="icon"
      variant="ghost"
      class="size-8 shrink-0"
      :disabled="props.pending"
    >
      <PlusIcon class="size-4" />
    </Button>
  </form>
</template>
