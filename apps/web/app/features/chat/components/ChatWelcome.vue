<script setup lang="ts">
const { t } = useI18n();
const session = useAuthSession();

const timeOfDayGreeting = computed(() => {
  const hour = new Date().getHours();
  if (hour < 12) return t('chat.welcome.morning');
  if (hour < 18) return t('chat.welcome.afternoon');
  return t('chat.welcome.evening');
});

const firstName = computed(() => session.value?.user?.name?.split(' ')[0]);

const heading = computed(() => {
  const greeting = timeOfDayGreeting.value;
  if (!firstName.value) return greeting;
  return t('chat.welcome.greetingWithName', {
    greeting,
    name: firstName.value,
  });
});
</script>

<template>
  <div class="flex flex-col gap-2 px-1">
    <h1 class="font-display text-display font-semibold">{{ heading }}</h1>
    <p class="text-chat text-muted-foreground">
      {{ t('chat.welcome.subtitle') }}
    </p>
  </div>
</template>
