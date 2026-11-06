<script setup lang="ts">
// Composables
const { t } = useI18n();
const session = useAuthSession();

// Computed
const timeOfDayGreeting = computed(() => {
  const hour = new Date().getHours();
  if (hour < 12) return t('chat.welcome.morning');
  if (hour < 18) return t('chat.welcome.afternoon');
  return t('chat.welcome.evening');
});

const firstName = computed(() => session.value?.user?.name?.split(' ')[0]);

const heading = computed(() => {
  const greeting = timeOfDayGreeting.value;
  if (!firstName.value) return t('chat.welcome.withoutName', { greeting });
  return t('chat.welcome.withName', { greeting, name: firstName.value });
});
</script>

<template>
  <h1 class="text-center text-3xl font-medium tracking-tight">
    {{ heading }}
  </h1>
</template>
