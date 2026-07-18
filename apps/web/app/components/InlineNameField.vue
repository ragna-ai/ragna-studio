<script setup lang="ts">
import { useForm } from '@tanstack/vue-form';
import { z } from 'zod';

// Inline click-to-edit name, used as the current item of a PageBreadcrumb
// trail (workflow editor, dataset detail). Emits `save` only when the
// submitted name actually changed.

// Props
// Named `label` (not `ariaLabel`): a prop whose camelCase form matches a
// native `aria-*` attribute never receives kebab-case `aria-label` bindings
// in Volar's checking — the binding is absorbed as the plain HTML attribute.
const props = defineProps<{ label: string }>();

// Emits
const emit = defineEmits<{ save: [] }>();

// Refs
const name = defineModel<string>('name', { required: true });
const isEditing = ref(false);
const formRef = useTemplateRef('formRef');

// Functions
const nameSchema = z.object({
  name: z.string().trim().min(1, { message: 'Name is required.' }),
});

const form = useForm({
  defaultValues: { name: name.value },
  validators: { onChange: nameSchema },
  onSubmit: ({ value }) => {
    isEditing.value = false;
    if (value.name === name.value) {
      return;
    }
    name.value = value.name;
    emit('save');
  },
});

function startEditing() {
  form.setFieldValue('name', name.value);
  // The input is focused on mount, so we need to set this after the next tick
  nextTick(() => {
    isEditing.value = true;
  });
}

function cancelEditing() {
  isEditing.value = false;
}

// Commits the edit on blur and on an outside click, not just blur alone:
// autofocus can occasionally lose the race with a fast outside click, which
// would leave the input focused but never blurred. The isEditing guard skips
// the redundant submit that fires when Escape already closed the field.
function commitEdit() {
  if (!isEditing.value) {
    return;
  }
  form.handleSubmit();
}

onClickOutside(formRef, commitEdit);

// A global listener, not just a handler on the input, so Escape cancels
// even if focus never made it into the input (same autofocus race as the
// outside-click case above).
onKeyStroke('Escape', (event) => {
  if (!isEditing.value) {
    return;
  }
  event.preventDefault();
  cancelEditing();
});
</script>

<template>
  <h1 class="truncate text-sm font-semibold">
    <form
      v-if="isEditing"
      ref="formRef"
      @submit.prevent.stop="form.handleSubmit"
    >
      <form.Field name="name">
        <template v-slot="{ field, state }">
          <Input
            :id="field.name"
            autofocus
            :aria-label="props.label"
            autocomplete="off"
            class="h-7 px-2 py-0 text-sm font-semibold"
            :model-value="state.value"
            @update:model-value="(v) => field.handleChange(String(v))"
            @blur="
              () => {
                field.handleBlur();
                commitEdit();
              }
            "
          />
          <FormFieldInfo :state="state" />
        </template>
      </form.Field>
    </form>
    <button
      v-else
      type="button"
      class="block max-w-full truncate text-left"
      @click="startEditing"
    >
      {{ name }}
    </button>
  </h1>
</template>
