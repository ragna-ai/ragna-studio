<script setup lang="ts">
// Imports
import { authClient } from '@repo/auth/client';
import { Button } from '@/components/ui/button';

// Composables
const { data: session } = await authClient.useSession(useFetch);

// Functions
async function signOut() {
  await authClient.signOut();
  await navigateTo('/auth/login');
}
</script>

<template>
  <div v-if="session">
    <p>Welcome, {{ session.user.name }}</p>
    <Button @click="signOut">Sign out</Button>
  </div>
  <div v-else>
    <p>You are not logged in.</p>
    <NuxtLink to="/auth/login">Go to Login</NuxtLink>
  </div>
</template>
