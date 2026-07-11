<script setup lang="ts">
import type { AnyFieldApi } from '@tanstack/vue-form';

const props = defineProps<{
  state: AnyFieldApi['state'];
}>();
</script>

<template>
  <template v-if="props.state.meta.isBlurred">
    <em
      v-for="error of props.state.meta.errors"
      class="block pt-2 text-sm text-destructive not-italic"
    >
      {{ error.message }}
    </em>
    <span
      v-if="props.state.meta.isValidating"
      class="block pt-2 text-xs text-muted-foreground"
    >
      Validating...
    </span>
  </template>
</template>
