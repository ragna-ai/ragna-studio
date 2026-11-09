<script setup lang="ts">
import { NuxtLinkLocale } from '#components';
import HomeOverview from '~/features/home/components/HomeOverview.vue';
import { useHomeDashboard } from '~/features/home/composables/useHomeDashboard';

const { t, locale } = useI18n();
useHead({ title: t('home.title') });

const session = useAuthSession();
const { pending, summary } = useHomeDashboard();

const headingTitle = computed(() => {
  if (session.value?.user?.name) {
    const firstName = session.value.user.name.split(' ')[0];
    return t('home.titleWithName', { name: firstName });
  }
  return t('home.title');
});
</script>

<template>
  <PagePanel>
    <div>
      <header
        class="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 px-page pt-3"
      >
        <div class="flex flex-col gap-1.5">
          <NuxtTime
            :datetime="Date.now()"
            :locale="locale"
            weekday="long"
            day="numeric"
            month="long"
            class="font-mono text-caption font-medium tracking-[0.04em] text-muted-foreground uppercase"
          />
          <h1 class="text-title-lg font-semibold">{{ headingTitle }}</h1>
          <p class="min-h-5 text-body text-muted-foreground">
            <template v-if="!pending">{{ summary }}</template>
          </p>
        </div>
        <div class="flex gap-2">
          <Button
            :as="NuxtLinkLocale"
            to="/chat"
            variant="outline"
            leading-icon="hugeicons:bubble-chat"
          >
            {{ t('home.dashboard.newChat') }}
          </Button>
          <Button
            :as="NuxtLinkLocale"
            to="/tasks"
            leading-icon="hugeicons:plus-sign"
          >
            {{ t('home.dashboard.newTask') }}
          </Button>
        </div>
      </header>
      <div class="px-page pt-6 pb-page-bottom">
        <HomeOverview />
      </div>
    </div>
  </PagePanel>
</template>
