<script setup lang="ts">
import { XIcon } from '@lucide/vue';
import {
  TagsInput,
  TagsInputInput,
  TagsInputItem,
  TagsInputItemDelete,
  TagsInputItemText,
} from '~/components/ui/tags-input';

// Props
const props = defineProps<{
  label: string;
  placeholder?: string;
  /** Native `autofocus`, passed through to the underlying input - used by EmailDraftPanel.vue to focus recipients on a fresh forward/new-message draft. */
  autofocus?: boolean;
}>();

// Model: recipient email addresses, one TagsInput tag per address.
const model = defineModel<string[]>({ default: () => [] });
</script>

<template>
  <div class="flex items-start gap-2 border-b py-1.5">
    <span class="mt-1.5 w-10 shrink-0 text-sm text-muted-foreground">{{
      props.label
    }}</span>
    <TagsInput
      v-model="model"
      class="flex-1 border-0 px-0 shadow-none focus-within:ring-0"
    >
      <TagsInputItem v-for="address in model" :key="address" :value="address">
        <TagsInputItemText />
        <TagsInputItemDelete>
          <XIcon class="size-3" />
        </TagsInputItemDelete>
      </TagsInputItem>
      <TagsInputInput
        :placeholder="props.placeholder"
        :autofocus="props.autofocus"
      />
    </TagsInput>
  </div>
</template>
