<script setup lang="ts">
import {
  ArchiveIcon,
  FileEditIcon,
  MailIcon,
  MailOpenIcon,
  SparklesIcon,
  StarIcon,
  Trash2Icon,
  TrashIcon,
} from '@lucide/vue';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import { useDateTimeFormat } from '~/composables/useDateTimeFormat';
import EmailCategoryBadge from '~/features/email/components/EmailCategoryBadge.vue';
import { threadParticipantsLabel } from '~/features/email/lib/email-display';
import type {
  EmailCategory,
  EmailDraft,
  EmailThreadSummary,
} from '~/features/email/types';

// Props
const props = defineProps<{
  thread: EmailThreadSummary;
  category: EmailCategory | null;
  /** The thread's active draft, if any (EmailThreadList.vue's `draftByThreadId` lookup) - drives the "Draft" indicator badge below. */
  draft: EmailDraft | null;
  isActive: boolean;
  isTrashedFolder: boolean;
  isSelected: boolean;
  /** Any thread is selected right now - keeps every row's checkbox visible, not just the hovered one (specs/email/mass-deletion-change-request.md, "Toolbar placement"). */
  selectionActive: boolean;
}>();

// Emits
const emit = defineEmits<{
  open: [];
  archive: [];
  trash: [boolean];
  star: [boolean];
  toggleRead: [];
  toggleSelect: [];
}>();

// Composables
const { t } = useI18n();
const { formatDateTime } = useDateTimeFormat();
</script>

<template>
  <li
    class="group flex cursor-pointer items-start gap-3 border-b px-3 py-3 hover:bg-muted/50"
    :class="{
      'bg-muted': props.isActive,
      'bg-white': !props.thread.isUnread && !props.isActive,
    }"
    @click="emit('open')"
  >
    <div class="min-w-0 flex-1">
      <div class="flex items-center justify-between gap-2">
        <p
          class="truncate text-sm"
          :class="props.thread.isUnread ? 'font-semibold' : 'font-medium'"
        >
          {{
            threadParticipantsLabel(props.thread) ||
            t('email.thread.unknownSender')
          }}
        </p>
        <!-- Timestamp and hover actions share one grid cell (both placed at
             col/row 1) so the cell sizes to the wider of the two and neither
             ever overlaps the other; group-focus-within keeps the actions (and
             their focus rings) visible for keyboard users, not just on hover.
             The selection checkbox lives in the same bar as the other row
             actions, first in line right before the star button, instead of
             its own column - it needs the bar visible whenever any row is
             selected, not just on hover, hence selectionActive on top of the
             existing group-hover/group-focus-within opacity toggle. -->
        <div class="grid shrink-0 items-center justify-items-end">
          <span
            class="col-start-1 row-start-1 flex items-center gap-1 text-xs text-muted-foreground group-focus-within:opacity-0 group-hover:opacity-0"
            :class="{ 'opacity-0': props.selectionActive }"
          >
            <StarIcon
              v-if="props.thread.isStarred"
              class="size-3 shrink-0 fill-amber-400 text-amber-400"
            />
            {{
              props.thread.lastMessageAt
                ? formatDateTime(props.thread.lastMessageAt)
                : ''
            }}
          </span>
          <div
            class="z-10 col-start-1 row-start-1 flex items-center gap-0.5 group-focus-within:opacity-100 group-hover:opacity-100"
            :class="props.selectionActive ? 'opacity-100' : 'opacity-0'"
            @click.stop
          >
            <Checkbox
              :model-value="props.isSelected"
              :aria-label="t('email.thread.actions.select')"
              @update:model-value="emit('toggleSelect')"
            />
            <Button
              variant="ghost"
              size="icon"
              class="size-7"
              :aria-label="t('email.thread.actions.toggleStar')"
              @click="emit('star', !props.thread.isStarred)"
            >
              <StarIcon
                class="size-3.5 text-muted-foreground"
                :class="{
                  'fill-amber-400 text-amber-400': props.thread.isStarred,
                }"
              />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              class="size-7"
              :aria-label="t('email.thread.actions.toggleRead')"
              @click="emit('toggleRead')"
            >
              <MailIcon
                v-if="props.thread.isUnread"
                class="size-3.5 text-muted-foreground"
              />
              <MailOpenIcon v-else class="size-3.5 text-muted-foreground" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              class="size-7"
              :aria-label="t('email.thread.actions.archive')"
              @click="emit('archive')"
            >
              <ArchiveIcon class="size-3.5 text-muted-foreground" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              class="group/trash size-7"
              :aria-label="
                props.isTrashedFolder
                  ? t('email.thread.actions.restore')
                  : t('email.thread.actions.trash')
              "
              @click="emit('trash', !props.isTrashedFolder)"
            >
              <TrashIcon
                v-if="props.isTrashedFolder"
                class="size-3.5 text-muted-foreground group-hover/trash:text-green-600"
              />
              <Trash2Icon
                v-else
                class="size-3.5 text-muted-foreground group-hover/trash:text-destructive"
              />
            </Button>
          </div>
        </div>
      </div>
      <p
        class="truncate text-sm"
        :class="props.thread.isUnread ? 'font-medium' : 'text-muted-foreground'"
      >
        {{ props.thread.subject || t('email.thread.noSubject') }}
      </p>
      <p class="truncate text-xs text-muted-foreground">
        {{ props.thread.snippet }}
      </p>
      <div class="mt-1 flex items-center gap-1.5">
        <EmailCategoryBadge v-if="props.category" :category="props.category" />
        <span
          v-if="props.thread.messageCount > 1"
          class="rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
        >
          {{ props.thread.messageCount }}
        </span>
        <span
          v-if="props.draft"
          class="flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
        >
          <SparklesIcon v-if="props.draft.origin === 'ai'" class="size-3" />
          <FileEditIcon v-else class="size-3" />
          {{ t('email.thread.draftBadge') }}
        </span>
      </div>
    </div>
  </li>
</template>
