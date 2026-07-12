<script setup lang="ts">
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
</script>

<template>
  <Message :from="message.role" class="max-w-full">
    <MessageContent class="group-[.is-assistant]:w-full">
      <template v-for="(part, index) in message.parts" :key="index">
        <MessageResponse v-if="part.type === 'text'" :content="part.text" />

        <Reasoning
          v-else-if="part.type === 'reasoning'"
          :is-streaming="part.state === 'streaming'"
        >
          <ReasoningTrigger />
          <ReasoningContent :content="part.text" />
        </Reasoning>

        <Tool v-else-if="isStaticToolUIPart(part)">
          <ToolHeader :type="part.type" :state="part.state" />
          <ToolContent>
            <ToolInput :input="part.input" />
            <ToolOutput :output="part.output" :error-text="part.errorText" />
          </ToolContent>
        </Tool>
      </template>
    </MessageContent>
  </Message>
</template>
