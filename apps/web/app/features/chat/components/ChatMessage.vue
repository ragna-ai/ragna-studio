<script setup lang="ts">
import type { GeneratedAgentImage, getGeneratedImagesOutput } from '@repo/ai';
import type { UIMessage } from 'ai';
import { isStaticToolUIPart } from 'ai';
import {
  Message,
  MessageContent,
  MessageResponse,
} from '~/components/ai-elements/message';
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from '~/components/ai-elements/reasoning';
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from '~/components/ai-elements/tool';

interface Props {
  message: UIMessage;
}

defineProps<Props>();

// Functions
type ToolPart = { type: string; state: string; output?: unknown };

function generatedImages(part: ToolPart): GeneratedAgentImage[] {
  if (part.type !== 'tool-imageGen' || part.state !== 'output-available') {
    return [];
  }
  // The generic UIMessage type erases per-tool output types.
  const output = part.output as getGeneratedImagesOutput;
  return 'images' in output ? output.images : [];
}

// group-[.is-assistant]:w-full
</script>

<template>
  <Message :from="message.role" class="max-w-full">
    <MessageContent class="">
      <template v-for="(part, index) in message.parts" :key="index">
        <MessageResponse v-if="part.type === 'text'" :content="part.text" />

        <Reasoning
          v-else-if="part.type === 'reasoning'"
          :is-streaming="part.state === 'streaming'"
        >
          <ReasoningTrigger />
          <ReasoningContent :content="part.text" />
        </Reasoning>

        <template v-else-if="isStaticToolUIPart(part)">
          <Tool>
            <ToolHeader :type="part.type" :state="part.state" />
            <ToolContent>
              <ToolInput :input="part.input" />
              <ToolOutput :output="part.output" :error-text="part.errorText" />
            </ToolContent>
          </Tool>

          <div
            v-if="generatedImages(part).length > 0"
            class="grid grid-cols-2 gap-2"
          >
            <img
              v-for="image in generatedImages(part)"
              :key="image.id"
              :src="image.imgUrl"
              alt="Generated image"
              class="w-full rounded-lg"
            />
          </div>
        </template>
      </template>
    </MessageContent>
  </Message>
</template>
