<script setup lang="ts">
import { PlusIcon, Trash2Icon } from '@lucide/vue';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import {
  useAddAutoDraftSender,
  useGetAutoDraftSenders,
  useRemoveAutoDraftSender,
} from '~/features/email/composables/useEmailAutoDraftSenderApi';

// Senders on this list always trigger auto-draft, independent of category.

// Composables
const { t } = useI18n();
const { data } = useGetAutoDraftSenders();
const { mutate: addSender, isPending: isAdding } = useAddAutoDraftSender();
const { mutate: removeSender } = useRemoveAutoDraftSender();

// Refs
const newSenderEmail = ref('');

// Computed
const senders = computed(() => data.value?.senders ?? []);

// Functions
function handleAdd() {
  const email = newSenderEmail.value.trim();
  if (!email) return;
  addSender(email, { onSuccess: () => (newSenderEmail.value = '') });
}
</script>

<template>
  <Card class="mx-auto w-full max-w-2xl">
    <CardHeader>
      <CardTitle>{{ t('email.settings.senders.title') }}</CardTitle>
      <p class="text-sm text-muted-foreground">{{ t('email.settings.senders.subtitle') }}</p>
    </CardHeader>
    <CardContent class="space-y-4">
      <form class="flex items-center gap-2" @submit.prevent="handleAdd">
        <Input
          v-model="newSenderEmail"
          type="email"
          class="flex-1"
          :placeholder="t('email.settings.senders.placeholder')"
          autocomplete="off"
        />
        <Button type="submit" size="icon" :disabled="isAdding">
          <Spinner v-if="isAdding" />
          <PlusIcon v-else class="size-4" />
        </Button>
      </form>

      <ul v-if="senders.length > 0" class="divide-y">
        <li v-for="sender in senders" :key="sender.id" class="flex items-center justify-between py-2">
          <span class="text-sm">{{ sender.senderEmail }}</span>
          <Button variant="ghost" size="icon" :aria-label="t('common.delete')" @click="removeSender(sender.id)">
            <Trash2Icon class="size-4 text-destructive" />
          </Button>
        </li>
      </ul>
      <p v-else class="text-sm text-muted-foreground">{{ t('email.settings.senders.empty') }}</p>
    </CardContent>
  </Card>
</template>
