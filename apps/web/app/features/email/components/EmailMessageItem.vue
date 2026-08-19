<script setup lang="ts">
import { Avatar, AvatarFallback } from '~/components/ui/avatar';
import { useDateTimeFormat } from '~/composables/useDateTimeFormat';
import EmailCategoryBadge from '~/features/email/components/EmailCategoryBadge.vue';
import EmailContentIframe from '~/features/email/components/EmailContentIframe.vue';
import EmailMessageAttachments from '~/features/email/components/EmailMessageAttachments.vue';
import {
  formatParticipant,
  formatParticipantList,
  participantInitials,
} from '~/features/email/lib/email-display';
import type { EmailCategory, EmailMessageDetail } from '~/features/email/types';

// Props
const props = defineProps<{
  message: EmailMessageDetail;
  category: EmailCategory | null;
  expanded: boolean;
}>();

// Emits
const emit = defineEmits<{
  toggleExpand: [];
}>();

// Composables
const { t } = useI18n();
const { formatDateTime } = useDateTimeFormat();

// Computed
const toLabel = computed(() => formatParticipantList(props.message.to));
</script>

<template>
  <article class="border-b last:border-b-0">
    <button
      type="button"
      class="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/30"
      @click="emit('toggleExpand')"
    >
      <Avatar class="size-8 shrink-0">
        <AvatarFallback class="text-xs">{{
          participantInitials(props.message.from)
        }}</AvatarFallback>
      </Avatar>
      <div class="min-w-0 flex-1">
        <div class="flex items-center justify-between gap-2">
          <div class="flex min-w-0 items-center gap-2">
            <p
              class="truncate text-sm font-medium"
              :class="{ 'font-semibold': props.message.isUnread }"
            >
              {{ formatParticipant(props.message.from) }}
            </p>
            <EmailCategoryBadge
              v-if="props.category"
              :category="props.category"
            />
          </div>
          <span class="shrink-0 text-xs text-muted-foreground">{{
            formatDateTime(props.message.sentAt)
          }}</span>
        </div>
        <p class="truncate text-sm text-muted-foreground">
          {{ props.message.subject || t('email.thread.noSubject') }}
        </p>
        <p v-if="props.expanded" class="truncate text-xs text-muted-foreground">
          {{ t('email.message.to', { recipients: toLabel }) }}
        </p>
      </div>
    </button>

    <div v-if="props.expanded" class="px-4 pb-4">
      <div class="bg-white">
        <EmailContentIframe :html="props.message.body?.html ?? ''" />
      </div>

      <EmailMessageAttachments
        :message-id="props.message.id"
        :expanded="props.expanded"
      />
    </div>
  </article>
</template>
