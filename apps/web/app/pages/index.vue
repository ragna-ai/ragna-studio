<script setup lang="ts">
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

const buttonFocus =
  'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:border-transparent';
</script>

<template>
  <div>
    <header
      class="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 px-(--page-x) pt-3"
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
          as-child
          variant="outline"
          size="sm"
          class="bg-card pr-3 pl-2.5 text-body font-medium shadow-xs hover:bg-surface-subtle"
          :class="buttonFocus"
        >
          <NuxtLinkLocale to="/chat">
            <Icon name="hugeicons:bubble-chat" class="size-4" />
            {{ t('home.dashboard.newChat') }}
          </NuxtLinkLocale>
        </Button>
        <Button
          as-child
          size="sm"
          class="pr-3 pl-2.5 text-body font-medium hover:bg-primary/90"
          :class="buttonFocus"
        >
          <NuxtLinkLocale to="/tasks">
            <Icon name="hugeicons:plus-sign" class="size-4" />
            {{ t('home.dashboard.newTask') }}
          </NuxtLinkLocale>
        </Button>
      </div>
    </header>
    <div class="px-(--page-x) pt-6 pb-(--page-bottom)">
      <HomeOverview />
    </div>
  </div>
</template>
