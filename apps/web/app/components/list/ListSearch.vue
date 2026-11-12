<script setup lang="ts">
import { Button } from '~/components/ui/button';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '~/components/ui/input-group';

interface ListSearchProps {
  placeholder: string;
}

defineProps<ListSearchProps>();

const searchText = defineModel<string>({ default: '' });

const { t } = useI18n();
</script>

<template>
  <InputGroup size="sm" class="w-60">
    <InputGroupAddon>
      <Icon name="hugeicons:search-01" class="size-4" />
    </InputGroupAddon>
    <InputGroupInput
      v-model="searchText"
      :placeholder="placeholder"
      :aria-label="placeholder"
    />
    <InputGroupAddon v-if="searchText" align="inline-end">
      <Button
        variant="ghost"
        size="icon-2xs"
        leading-icon="hugeicons:cancel-01"
        :aria-label="t('common.clear')"
        @click="searchText = ''"
      />
    </InputGroupAddon>
  </InputGroup>
</template>
