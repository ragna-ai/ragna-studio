<script setup lang="ts">
// Imports
import { Button } from '~/components/ui/button';
import { Spinner } from '~/components/ui/spinner';
import { Textarea } from '~/components/ui/textarea';

// Props
const props = defineProps<{
  content: string;
  disabled: boolean;
  isSaving: boolean;
}>();

// Emits
const emit = defineEmits<{
  save: [content: string];
}>();

// Refs
const draft = ref(props.content);

// Composables
const { t } = useI18n();

// Computed
const isDirty = computed(() => draft.value !== props.content);
const canSave = computed(
  () => !props.disabled && isDirty.value && draft.value.trim().length > 0,
);

// Functions
function handleSave() {
  if (!canSave.value) {
    return;
  }
  emit('save', draft.value);
}

// Hooks
watch(
  () => props.content,
  (content) => {
    draft.value = content;
  },
);
</script>

<template>
  <div class="space-y-2">
    <Textarea
      v-model="draft"
      rows="6"
      maxlength="3000"
      :disabled="disabled"
      :placeholder="t('social.editor.contentPlaceholder')"
      class="text-sm"
    />
    <div class="flex items-center justify-between">
      <span class="text-xs text-muted-foreground"
        >{{ draft.length }} / 3000</span
      >
      <Button
        v-if="!disabled"
        size="sm"
        :disabled="!canSave || isSaving"
        @click="handleSave"
      >
        <Spinner v-if="isSaving" class="mr-2" />
        {{ t('social.actions.save') }}
      </Button>
    </div>
  </div>
</template>
