<script setup lang="ts">
import { useForm } from '@tanstack/vue-form';
import { z } from 'zod';
import { createWorkflowNode } from '~/features/workflow/lib/default-node';
import { useUpsertWorkflow } from '~/features/workflow/composables/useWorkflowApi';

// Imports

const workflowCreateSchema = z.object({
  name: z.string().min(1, { message: 'Name is required.' }),
  description: z.string(),
});

// Composables
const { isPending, mutateAsync } = useUpsertWorkflow();

const form = useForm({
  defaultValues: {
    name: '',
    description: '',
  },
  validators: {
    onChange: workflowCreateSchema,
  },
  onSubmit: async ({ value }) => {
    // Every workflow needs exactly one trigger node before it can be
    // published, so start the canvas with one already placed.
    const triggerNode = createWorkflowNode('trigger', { x: 250, y: 150 });
    const response = await mutateAsync({
      name: value.name,
      description: value.description || undefined,
      definition: { nodes: [triggerNode], edges: [] },
    });
    await navigateTo(`/workflow/${response.workflow.id}`);
  },
});
</script>

<template>
  <SectionWrapper>
    <Heading bg-position="bottom">
      <template #top>
        <HeadingTitle
          title="New workflow"
          subtitle="Give it a name, then build it on the canvas."
        />
      </template>
      <template #bottom> </template>
    </Heading>
    <div class="px-10">
      <form class="max-w-lg space-y-6" @submit.prevent.stop="form.handleSubmit">
        <form.Field name="name">
          <template v-slot="{ field, state }">
            <div>
              <Label class="mb-2 block text-sm font-medium" :for="field.name">
                Name
              </Label>
              <Input
                :id="field.name"
                :model-value="state.value"
                autocomplete="off"
                @update:model-value="(v) => field.handleChange(String(v))"
                @blur="field.handleBlur"
              />
              <FormFieldInfo :state="state" />
            </div>
          </template>
        </form.Field>

        <form.Field name="description">
          <template v-slot="{ field, state }">
            <div>
              <Label class="mb-2 block text-sm font-medium" :for="field.name">
                Description
              </Label>
              <Textarea
                :id="field.name"
                rows="3"
                :model-value="state.value"
                autocomplete="off"
                @update:model-value="(v) => field.handleChange(String(v))"
                @blur="field.handleBlur"
              />
              <FormFieldInfo :state="state" />
            </div>
          </template>
        </form.Field>

        <div class="flex justify-end gap-4">
          <Button as-child variant="secondary">
            <NuxtLinkLocale to="/workflow">Cancel</NuxtLinkLocale>
          </Button>
          <Button type="submit" :disabled="isPending">
            <Spinner v-if="isPending" class="mr-2" />
            Create
          </Button>
        </div>
      </form>
    </div>
  </SectionWrapper>
</template>
