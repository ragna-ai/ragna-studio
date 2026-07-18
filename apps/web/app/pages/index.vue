<script setup lang="ts">
const { t } = useI18n();
useHead({ title: t('home.title') });

const session = useAuthSession();

// greeting the user with their first name if they are logged in
const headingTitle = computed(() => {
  if (session.value?.user?.name) {
    const firstName = session.value.user.name.split(' ')[0];
    return t('home.titleWithName', { name: firstName });
  }
  return t('home.title');
});
</script>

<template>
  <SectionWrapper>
    <Heading bg-position="bottom">
      <template #top>
        <HeadingTitle :title="headingTitle" :subtitle="$t('home.subtitle')" />
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
