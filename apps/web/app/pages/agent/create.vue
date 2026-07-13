<script setup lang="ts">
import AgentUpsertForm from '~/features/agent/components/AgentUpsertForm.vue';

// Imports

// Props
// Emits

// Refs

// Composables

// Computed
// Functions

// Hooks
</script>

<template>
  <SectionWrapper>
    <Heading bg-position="bottom">
      <template #top>
        <HeadingTitle
          :title="$t('agent.upsert.title')"
          :subtitle="$t('agent.upsert.subtitle')"
        />
      </template>
      <template #bottom> </template>
    </Heading>
    <div class="px-10">
      <AgentUpsertForm />
    </div>
  </SectionWrapper>
</template>
