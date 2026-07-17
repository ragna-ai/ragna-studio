<script setup lang="ts">
import { XIcon } from '@lucide/vue';

// Aside panel for editing a detail-page resource's name and description
// (dataset detail, workflow editor), following the DatasetRowPanel aside
// conventions: fields save on blur, and `save` is only emitted when a
// value actually changed. The breadcrumb's inline rename stays the quick
// path for the name.

// Props
interface Props {
  name: string;
  description: string;
  title?: string;
  nameLabel?: string;
  descriptionLabel?: string;
  descriptionPlaceholder?: string;
  closeLabel?: string;
}

const props = withDefaults(defineProps<Props>(), {
  title: 'Settings',
  nameLabel: 'Name',
  descriptionLabel: 'Description',
  descriptionPlaceholder: 'Add a description...',
  closeLabel: 'Close',
});

// Emits
const emit = defineEmits<{
  (e: 'save', value: { name: string; description: string }): void;
  (e: 'close'): void;
}>();

// Refs
// Local drafts so a blur can revert an empty name and diff against the
// persisted values before emitting.
const nameDraft = ref(props.name);
const descriptionDraft = ref(props.description);
const nameFieldId = useId();
const descriptionFieldId = useId();

// Keep the drafts synced to the persisted values, so a refetch after an
// edit elsewhere (e.g. the breadcrumb rename) never shows stale text.
watch(
  () => [props.name, props.description] as const,
  ([loadedName, loadedDescription]) => {
    nameDraft.value = loadedName;
    descriptionDraft.value = loadedDescription;
  },
);

// Functions
function commitName() {
  const trimmedName = nameDraft.value.trim();
  if (trimmedName === '') {
    nameDraft.value = props.name;
    return;
  }
  nameDraft.value = trimmedName;
  emitIfChanged();
}

function commitDescription() {
  descriptionDraft.value = descriptionDraft.value.trim();
  emitIfChanged();
}

function emitIfChanged() {
  if (nameDraft.value === props.name && descriptionDraft.value === props.description) {
    return;
  }
  emit('save', { name: nameDraft.value, description: descriptionDraft.value });
}
</script>

<template>
  <aside class="flex h-full w-80 shrink-0 flex-col gap-4 overflow-y-auto border-l bg-card p-4">
    <div class="flex items-center justify-between">
      <p class="text-sm font-semibold">{{ props.title }}</p>
      <Button variant="ghost" size="icon" :aria-label="props.closeLabel" @click="emit('close')">
        <XIcon class="size-4 stroke-1.5" />
      </Button>
    </div>

    <div class="space-y-1">
      <Label class="text-xs text-muted-foreground" :for="nameFieldId">
        {{ props.nameLabel }}
      </Label>
      <Input :id="nameFieldId" v-model="nameDraft" @blur="commitName" />
    </div>

    <div class="space-y-1">
      <Label class="text-xs text-muted-foreground" :for="descriptionFieldId">
        {{ props.descriptionLabel }}
      </Label>
      <Textarea
        :id="descriptionFieldId"
        v-model="descriptionDraft"
        class="min-h-24"
        :placeholder="props.descriptionPlaceholder"
        @blur="commitDescription"
      />
    </div>
  </aside>
</template>
