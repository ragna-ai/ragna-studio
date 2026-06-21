<script setup lang="ts">
import { authClient } from '@repo/auth/client';

// Imports

// Props
// Emits

// Refs

// Composables
const { data: session } = await authClient.useSession(useFetch);

// Computed
// Functions

// Hooks
</script>

<template>
  <div v-if="session">
    <p>Welcome, {{ session.user.name }}</p>
    <button @click="authClient.signOut()">Sign out</button>
  </div>
  <div v-else>
    <p>You are not logged in.</p>
    <NuxtLink to="/auth/login">Go to Login</NuxtLink>
  </div>
</template>
