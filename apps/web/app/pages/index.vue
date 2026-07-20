<script setup lang="ts">
const { t } = useI18n();
useHead({ title: t('home.title') });

const session = useAuthSession();
const { locale } = useI18n();

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
  <SectionWrapper class="relative">
    <div class="grid-background absolute inset-0 opacity-20"></div>
    <div class="relative z-10 mx-auto flex max-w-300 flex-col gap-4 p-20">
      <div class="flex flex-col gap-6">
        <!-- datetime -->
        <div class="text-sm font-medium text-foreground/75">
          <NuxtTime
            :datetime="Date.now()"
            :locale="locale"
            weekday="long"
            year="numeric"
            month="long"
            day="numeric"
          />
        </div>
        <div class="flex flex-col gap-1">
          <h1 class="text-4xl font-semibold text-foreground">
            {{ headingTitle }}
          </h1>
          <p
            class="bg-linear-to-r from-teal-500 to-blue-700 bg-clip-text text-4xl font-medium text-transparent opacity-85"
          >
            {{ $t('home.subtitle') }}
          </p>
        </div>
      </div>
      <div class="">
        <HomeQuickAccess />
        <div class="py-10">
          <HomeFavorites />
        </div>
      </div>
    </div>
  </SectionWrapper>
</template>
