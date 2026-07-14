<script setup lang="ts">
// Imports
import SocialPostList from '~/features/social/components/SocialPostList.vue';

// Props
// Emits
// Refs

// Composables
const { t } = useI18n();
useHead({
  title: t('social.list.title'),
});

// Computed
// Functions
// Hooks
</script>

<template>
  <SectionWrapper>
    <Heading bg-position="bottom">
      <template #top>
        <HeadingTitle :title="t('social.list.title')" :subtitle="t('social.list.subtitle')" />
      </template>
      <template #bottom> </template>
    </Heading>
    <div class="px-5 pb-10">
      <SocialPostList />
    </div>
  </SectionWrapper>
</template>
