<script setup lang="ts">
import { useGetAllAiModels } from '~/features/aimodel/composables/useAiModelList';

// Props
const modelValue = defineModel();

// Emits

// Refs

// Composables
const { data, isLoading, isError } = useGetAllAiModels();

// Computed

// Functions

// Hooks
</script>

<template>
  <div>
    <select v-if="data?.models" v-model="modelValue">
      <option v-for="model in data.models" :key="model.id" :value="model.id">
        {{ model.displayName }}
      </option>
    </select>
    <div v-else-if="isLoading">Loading AI models...</div>
    <div v-else-if="isError">Error loading AI models.</div>
  </div>
</template>
