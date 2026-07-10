<script setup lang="ts">
import UserProfileForm from '~/features/user/components/UserProfileForm.vue';

// Imports

// Props
// Emits

// Refs

// Composables
const session = useAuthSession();

// Computed
// Functions

// Hooks
</script>

<template>
  <div class="mx-auto w-full max-w-2xl">
    <UserProfileForm
      :name="session?.user.name ?? ''"
      :email="session?.user.email ?? ''"
    />
  </div>
</template>
