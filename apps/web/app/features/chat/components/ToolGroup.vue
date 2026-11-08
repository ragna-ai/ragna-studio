<script setup lang="ts">
import type { ReasoningUIPart, ToolUIPart } from 'ai';
import { isStaticToolUIPart } from 'ai';
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from '~/components/ai-elements/reasoning';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '~/components/ui/collapsible';
import ToolCall from '~/features/chat/components/ToolCall.vue';

type GroupMember = ToolUIPart | ReasoningUIPart;

interface ToolGroupProps {
  members: GroupMember[];
}

type GroupStatus = 'running' | 'failed' | 'done';

const STATUS_ICON: Record<GroupStatus, string> = {
  running: 'hugeicons:loading-03',
  failed: 'hugeicons:alert-circle',
  done: 'hugeicons:checkmark-circle-02',
};

const STATUS_CLASS: Record<GroupStatus, string> = {
  running: 'text-agent motion-safe:animate-spin',
  failed: 'text-status-danger',
  done: 'text-status-ok',
};

const props = defineProps<ToolGroupProps>();

const { t } = useI18n();

const terminalToolStates: ToolUIPart['state'][] = [
  'output-available',
  'output-error',
  'output-denied',
];

const toolMembers = computed(() => props.members.filter(isStaticToolUIPart));

const isRunning = computed(() =>
  props.members.some((member) =>
    isStaticToolUIPart(member)
      ? !terminalToolStates.includes(member.state)
      : member.state === 'streaming',
  ),
);

const status = computed<GroupStatus>(() => {
  if (isRunning.value) return 'running';
  return toolMembers.value.some((part) => part.state === 'output-error')
    ? 'failed'
    : 'done';
});
</script>

<template>
  <Collapsible class="group/tools not-prose w-full">
    <CollapsibleTrigger
      class="group/trigger flex h-6 items-center gap-1.5 rounded-sm text-small text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <Icon
        :name="STATUS_ICON[status]"
        class="size-4 shrink-0"
        :class="STATUS_CLASS[status]"
      />
      <span>{{ t('chat.message.toolGroup.summary', toolMembers.length) }}</span>
      <Icon
        name="hugeicons:arrow-down-01"
        class="size-3.5 text-icon transition-transform group-data-[state=open]/tools:rotate-180"
      />
    </CollapsibleTrigger>
    <CollapsibleContent class="flex flex-col gap-1 pt-2">
      <template v-for="(member, index) in members" :key="index">
        <ToolCall v-if="isStaticToolUIPart(member)" :part="member" />
        <Reasoning v-else :is-streaming="member.state === 'streaming'">
          <ReasoningTrigger />
          <ReasoningContent :content="member.text" />
        </Reasoning>
      </template>
    </CollapsibleContent>
  </Collapsible>
</template>
