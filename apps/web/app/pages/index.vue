<script setup lang="ts">
useHead({ title: 'Home' });
</script>

<template>
  <SectionWrapper>
    <Heading bg-position="bottom">
      <template #top>
        <HeadingTitle
          :title="$t('home.title')"
          :subtitle="$t('home.subtitle')"
        />
      </template>
      <template #bottom> </template>
    </Heading>
    <div class="mx-auto max-w-300 px-20">
      <HomeQuickAccess />
      <div class="py-10">
        <HomeFavorites />
      </div>
    </div>
  </SectionWrapper>
</template>
