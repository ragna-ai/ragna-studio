<script setup lang="ts">
import type { ReasoningUIPart, ToolUIPart } from 'ai';
import { isStaticToolUIPart } from 'ai';
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from '~/components/ai-elements/reasoning';
import { Collapsible, CollapsibleContent } from '~/components/ui/collapsible';
import ToolCall from '~/features/chat/components/ToolCall.vue';
import ToolLine from '~/features/chat/components/ToolLine.vue';
import type { ToolLineStatus } from '~/features/chat/lib/tool-status';
import { isToolRunning } from '~/features/chat/lib/tool-status';

type GroupMember = ToolUIPart | ReasoningUIPart;

interface ToolGroupProps {
  members: GroupMember[];
}

const props = defineProps<ToolGroupProps>();

const { t } = useI18n();

const toolMembers = computed(() => props.members.filter(isStaticToolUIPart));

const isRunning = computed(() =>
  props.members.some((member) =>
    isStaticToolUIPart(member)
      ? isToolRunning(member.state)
      : member.state === 'streaming',
  ),
);

const status = computed<ToolLineStatus>(() => {
  if (isRunning.value) return 'running';
  return toolMembers.value.some((part) => part.state === 'output-error')
    ? 'failed'
    : 'done';
});
</script>

<template>
  <Collapsible class="not-prose w-full">
    <ToolLine
      :status="status"
      :label="t('chat.message.toolGroup.summary', toolMembers.length)"
    />
    <CollapsibleContent class="flex flex-col gap-1 pt-1.5 pl-5.5">
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
