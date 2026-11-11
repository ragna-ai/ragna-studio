<script setup lang="ts">
import type {
  GeneratedAgentImage,
  getGeneratedImagesOutput,
} from '@repo/ai/client';
import type { ToolUIPart } from 'ai';
import { Collapsible, CollapsibleContent } from '~/components/ui/collapsible';
import ToolLine from '~/features/chat/components/ToolLine.vue';
import { toolLineStatus } from '~/features/chat/lib/tool-status';

interface ToolCallProps {
  part: ToolUIPart;
}

const props = defineProps<ToolCallProps>();

const { t, te } = useI18n();

const status = computed(() => toolLineStatus(props.part.state));

// <id> matches an agent.tool.<id>.label key in the locale files 1:1.
const toolId = computed(() => props.part.type.slice('tool-'.length));

const title = computed(() =>
  te(`agent.tool.${toolId.value}.label`)
    ? t(`agent.tool.${toolId.value}.label`)
    : toolId.value,
);

const hasOutput = computed(() => props.part.output !== undefined);

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
    <ToolLine :status="status" :label="title" />
    <CollapsibleContent class="flex flex-col gap-2 pt-1.5 pb-2 pl-5.5">
      <p v-if="part.errorText" class="text-small text-muted-foreground">
        {{ part.errorText }}
      </p>
      <template v-else>
        <pre
          class="max-h-64 overflow-auto rounded-md bg-surface-subtle p-2.5 font-mono text-mono-sm whitespace-pre-wrap"
          >{{ formatJson(part.input) }}</pre>
        <pre
          v-if="hasOutput"
          class="max-h-64 overflow-auto rounded-md bg-surface-subtle p-2.5 font-mono text-mono-sm whitespace-pre-wrap"
          >{{ formatJson(part.output) }}</pre>
      </template>
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
