<script setup lang="ts">
import type { GeneratedAgentImage, getGeneratedImagesOutput } from '@repo/ai/client';
import type { ToolUIPart } from 'ai';
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from '~/components/ai-elements/tool';
import { TOOL_ICONS } from '~/features/chat/lib/tool-icons';

interface Props {
  part: ToolUIPart;
}

const props = defineProps<Props>();

const { t, te } = useI18n();

// <id> matches an agent.tool.<id>.label key in the locale files 1:1.
const toolId = computed(() => props.part.type.slice('tool-'.length));

const title = computed(() =>
  te(`agent.tool.${toolId.value}.label`)
    ? t(`agent.tool.${toolId.value}.label`)
    : toolId.value,
);

const icon = computed(() => TOOL_ICONS[toolId.value]);

const generatedImages = computed<GeneratedAgentImage[]>(() => {
  if (props.part.type !== 'tool-imageGen' || props.part.state !== 'output-available') {
    return [];
  }
  // The generic UIMessage type erases per-tool output types.
  const output = props.part.output as getGeneratedImagesOutput;
  return 'images' in output ? output.images : [];
});
</script>

<template>
  <Tool>
    <ToolHeader
      :type="part.type"
      :state="part.state"
      :title="title"
      :icon="icon"
    />
    <ToolContent>
      <ToolInput :input="part.input" />
      <ToolOutput :output="part.output" :error-text="part.errorText" />
    </ToolContent>
  </Tool>

  <div v-if="generatedImages.length > 0" class="grid grid-cols-2 gap-2">
    <img
      v-for="image in generatedImages"
      :key="image.id"
      :src="image.imgUrl"
      alt="Generated image"
      class="w-full rounded-lg"
    />
  </div>
</template>
