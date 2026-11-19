<script setup lang="ts">
import { Button } from '~/components/ui/button';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '~/components/ui/input-group';

interface ListSearchProps {
  placeholder: string;
  /** Turns the search icon into a button that emits `submit`, like Enter. */
  submitOnIconClick?: boolean;
}

withDefaults(defineProps<ListSearchProps>(), { submitOnIconClick: false });

const emit = defineEmits<{ submit: [text: string] }>();

const searchText = defineModel<string>({ default: '' });

const { t } = useI18n();
</script>

<template>
  <InputGroup size="sm" class="w-60">
    <InputGroupAddon>
      <Button
        v-if="submitOnIconClick"
        variant="ghost"
        size="icon-2xs"
        leading-icon="hugeicons:search-01"
        :aria-label="placeholder"
        @click="emit('submit', searchText.trim())"
      />
      <Icon v-else name="hugeicons:search-01" class="size-4" />
    </InputGroupAddon>
    <InputGroupInput
      v-model="searchText"
      :placeholder="placeholder"
      :aria-label="placeholder"
      @keydown.enter.prevent="emit('submit', searchText.trim())"
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
