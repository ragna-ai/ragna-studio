<script setup lang="ts">
// Imports
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';

// Refs

// Composables
const { locale, locales, setLocale } = useI18n();

// Computed
const localeOptions = computed(() => locales.value);

// Functions
function handleLocaleChange(value: any) {
  setLocale(value);
}
</script>

<template>
  <Card class="mx-auto w-full max-w-2xl">
    <CardHeader>
      <CardTitle>{{ $t('user.language.title') }}</CardTitle>
    </CardHeader>
    <CardContent>
      <p class="mb-4 text-sm text-muted-foreground">
        {{ $t('user.language.subtitle') }}
      </p>
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
  </Card>
</template>
