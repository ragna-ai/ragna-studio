<script setup lang="ts">
import { MailIcon, UserIcon } from '@lucide/vue';
import { useForm } from '@tanstack/vue-form';
import { z } from 'zod';
import useUserApi from '~/features/user/composables/useUserApi.js';
import UserAvatar from './UserAvatar.vue';

// Props
const props = defineProps<{
  name: string;
  email: string;
}>();

// Refs

// Composables
const { updateUserProfile } = useUserApi();
const { isPending, mutate } = updateUserProfile();

// Functions
const updateSchema = z.object({
  name: z.string().min(4, {
    message: 'Name must be at least 4 characters.',
  }),
  email: z.email({
    message: 'Please enter a valid email address.',
  }),
});

const form = useForm({
  defaultValues: {
    name: props.name,
    email: props.email,
  },
  validators: {
    onChange: updateSchema,
  },
  onSubmit: ({ value }) => mutate({ name: value.name }),
});
</script>

<template>
  <form @submit.prevent.stop="form.handleSubmit">
    <div>
      <p class="mb-2 block text-sm font-medium">
        {{ $t('user.profile.avatar') }}
      </p>
      <div class="flex flex-row items-center justify-between">
        <UserAvatar :user-name="props.name" class="size-16" />
        <Button type="button" variant="outline">{{
          $t('user.profile.change')
        }}</Button>
      </div>
    </div>

    <Separator class="my-4" />

    <form.Field name="name">
      <template v-slot="{ field, state }">
        <div>
          <Label class="mb-2 block text-sm font-medium" :for="field.name">
            {{ $t('common.name') }}
          </Label>
          <InputGroup>
            <InputGroupAddon>
              <UserIcon class="text-muted-foreground" />
            </InputGroupAddon>
            <InputGroupInput
              :id="field.name"
              :model-value="state.value"
              @update:model-value="
                (v: string | number) => field.handleChange(String(v))
              "
              @blur="field.handleBlur"
            />
          </InputGroup>
          <FormFieldInfo :state="state" />
        </div>
      </template>
    </form.Field>

    <Separator class="my-4" />

    <form.Field name="email">
      <template v-slot="{ field, state }">
        <div>
          <Label class="mb-2 block text-sm font-medium" :for="field.name">
            {{ $t('user.profile.email') }}
          </Label>
          <InputGroup>
            <InputGroupAddon>
              <MailIcon class="text-muted-foreground" />
            </InputGroupAddon>
            <InputGroupInput
              :id="field.name"
              disabled
              :model-value="state.value"
            />
          </InputGroup>
        </div>
      </template>
    </form.Field>

    <Separator class="my-4" />

    <Button type="submit" :disabled="isPending">
      {{ $t('common.save') }}
    </Button>
  </form>
</template>
