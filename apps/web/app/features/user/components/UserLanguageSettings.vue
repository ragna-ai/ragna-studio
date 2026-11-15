<script setup lang="ts">
// Imports
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '~/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';

import { toast } from '~/lib/toast';
import { useUpdateUserLocale } from '~/features/user/composables/useUserProfileApi';

// Composables
const { t, locale, locales, setLocale } = useI18n();
const { mutateAsync: saveLocale } = useUpdateUserLocale();

// Computed
const localeOptions = computed(() => locales.value);

// Functions
async function handleLocaleChange(value: unknown) {
  const next = localeOptions.value.find((option) => option.code === value);
  if (!next || next.code === locale.value) return;

  const previous = locale.value;
  await setLocale(next.code);
  try {
    await saveLocale(next.code);
  } catch {
    await setLocale(previous);
    toast.error(t('user.toast.languageUpdateFailed'));
  }
}
</script>

<template>
  <SettingsCard class="mx-auto w-full max-w-2xl">
    <CardHeader>
      <CardTitle>{{ $t('user.language.title') }}</CardTitle>
      <CardDescription>{{ $t('user.language.subtitle') }}</CardDescription>
    </CardHeader>
    <CardContent>
      <Select :model-value="locale" @update:model-value="handleLocaleChange">
        <SelectTrigger class="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="option in localeOptions"
            :key="option.code"
            :value="option.code"
          >
            {{ option.name }}
          </SelectItem>
        </SelectContent>
      </Select>
    </CardContent>
  </SettingsCard>
</template>
