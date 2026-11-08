<script setup lang="ts">
import type {
  GeneratedAgentImage,
  getGeneratedImagesOutput,
} from '@repo/ai/client';
import type { ToolUIPart } from 'ai';
import StatusPill from '~/components/StatusPill.vue';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '~/components/ui/collapsible';
import { FALLBACK_TOOL_ICON, TOOL_ICONS } from '~/features/chat/lib/tool-icons';
import { TOOL_STATE_TONE } from '~/features/chat/lib/tool-status';

interface ToolCallProps {
  part: ToolUIPart;
}

const props = defineProps<ToolCallProps>();

const { t, te } = useI18n();

// <id> matches an agent.tool.<id>.label key in the locale files 1:1.
const toolId = computed(() => props.part.type.slice('tool-'.length));

const title = computed(() =>
  te(`agent.tool.${toolId.value}.label`)
    ? t(`agent.tool.${toolId.value}.label`)
    : toolId.value,
);

const icon = computed(() => TOOL_ICONS[toolId.value] ?? FALLBACK_TOOL_ICON);

const hasOutput = computed(
  () => props.part.output !== undefined || !!props.part.errorText,
);

function formatJson(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

const generatedImages = computed<GeneratedAgentImage[]>(() => {
  if (
    props.part.type !== 'tool-imageGen' ||
    props.part.state !== 'output-available'
  ) {
    return [];
  }
  // The generic UIMessage type erases per-tool output types.
  const output = props.part.output as getGeneratedImagesOutput;
  return 'images' in output ? output.images : [];
});
</script>

<template>
  <Collapsible class="not-prose w-full">
    <CollapsibleTrigger
      class="group/call flex h-8 w-full items-center gap-2 rounded-sm text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <Icon :name="icon" class="size-4 shrink-0 text-icon" />
      <span class="min-w-0 flex-1 truncate text-small font-medium">
        {{ title }}
      </span>
      <StatusPill
        :tone="TOOL_STATE_TONE[part.state]"
        :label="t(`chat.toolStatus.${part.state}`)"
      />
    </CollapsibleTrigger>
    <CollapsibleContent class="flex flex-col gap-2 pt-1 pb-2">
      <pre
        class="max-h-64 overflow-auto rounded-md bg-surface-subtle p-2.5 font-mono text-mono-sm whitespace-pre-wrap"
        >{{ formatJson(part.input) }}</pre>
      <pre
        v-if="hasOutput"
        class="max-h-64 overflow-auto rounded-md bg-surface-subtle p-2.5 font-mono text-mono-sm whitespace-pre-wrap"
        :class="part.errorText && 'text-status-danger-fg'"
        >{{ part.errorText ?? formatJson(part.output) }}</pre>
    </CollapsibleContent>
  </Collapsible>

  <div v-if="generatedImages.length > 0" class="grid grid-cols-2 gap-2">
    <img
      v-for="image in generatedImages"
      :key="image.id"
      :src="image.imgUrl"
      :alt="t('chat.toolCall.generatedImage')"
      class="w-full rounded-lg"
    />
  </div>
</template>
