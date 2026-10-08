<script setup lang="ts">
import { ChevronDownIcon, WrenchIcon } from '@lucide/vue';
import type { ReasoningUIPart, ToolUIPart } from 'ai';
import { isStaticToolUIPart } from 'ai';
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from '~/components/ai-elements/reasoning';
import { ToolStatusBadge } from '~/components/ai-elements/tool';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '~/components/ui/collapsible';
import ToolCall from '~/features/chat/components/ToolCall.vue';

type GroupMember = ToolUIPart | ReasoningUIPart;

interface Props {
  members: GroupMember[];
}

const props = defineProps<Props>();

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

const userToggled = ref(false);
const open = ref(isRunning.value);

// Debounced like Reasoning.vue's own auto-close, so a brief gap between steps doesn't flicker.
const AUTO_CLOSE_DELAY_MS = 1000;

watch(isRunning, (running, _previous, onCleanup) => {
  if (userToggled.value) return;

  if (running) {
    open.value = true;
    return;
  }

  const timer = setTimeout(() => {
    open.value = false;
  }, AUTO_CLOSE_DELAY_MS);
  onCleanup(() => clearTimeout(timer));
});

function handleOpenChange(value: boolean) {
  userToggled.value = true;
  open.value = value;
}

const summaryState = computed<ToolUIPart['state']>(() => {
  if (isRunning.value) return 'input-available';
  if (toolMembers.value.some((part) => part.state === 'output-error')) {
    return 'output-error';
  }
  if (toolMembers.value.some((part) => part.state === 'output-denied')) {
    return 'output-denied';
  }
  return 'output-available';
});

const isSingleCall = computed(() => toolMembers.value.length <= 1);
</script>

<template>
  <template v-if="isSingleCall">
    <template v-for="(member, index) in members" :key="index">
      <ToolCall v-if="isStaticToolUIPart(member)" :part="member" />
      <Reasoning v-else :is-streaming="member.state === 'streaming'">
        <ReasoningTrigger />
        <ReasoningContent :content="member.text" />
      </Reasoning>
    </template>
  </template>

  <Collapsible
    v-else
    :open="open"
    class="group not-prose w-full"
    @update:open="handleOpenChange"
  >
    <CollapsibleTrigger
      class="group/tool flex w-full items-center justify-between gap-4 py-3"
    >
      <div class="flex items-center gap-2">
        <WrenchIcon
          class="size-4 stroke-1.5 text-muted-foreground group-hover/tool:text-foreground"
        />
        <span
          class="text-sm text-foreground/60 group-hover/tool:text-foreground"
        >
          {{
            t('chat.message.toolGroup.summary', { count: toolMembers.length })
          }}
        </span>
        <ToolStatusBadge :state="summaryState" />
        <ChevronDownIcon
          class="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180"
        />
      </div>
    </CollapsibleTrigger>
    <CollapsibleContent class="space-y-2 pt-2">
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
