<script setup lang="ts">
import {
  FilePenIcon,
  FileTextIcon,
  FolderOpenIcon,
  ImageIcon,
  NotebookTextIcon,
  PencilLineIcon,
  SearchIcon,
} from '@lucide/vue';
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

// Composables
const { t } = useI18n();

// Functions
type ToolPart = { type: string; state: string; output?: unknown };

const generatedImages = (part: ToolPart): GeneratedAgentImage[] => {
  if (part.type !== 'tool-imageGen' || part.state !== 'output-available') {
    return [];
  }
  // The generic UIMessage type erases per-tool output types.
  const output = part.output as getGeneratedImagesOutput;
  return 'images' in output ? output.images : [];
};

const toolNames: Record<string, string> = {
  'tool-think': t('agent.tool.think.label'),
  'tool-linkedinDraft': t('agent.tool.linkedinDraft.label'),
  'tool-imageGen': t('agent.tool.imageGen.label'),
  'tool-webSearch': t('agent.tool.webSearch.label'),
  'tool-webBrowser': t('agent.tool.webBrowser.label'),
  'tool-listDocuments': t('agent.tool.listDocuments.label'),
  'tool-readDocument': t('agent.tool.readDocument.label'),
  'tool-editDocument': t('agent.tool.editDocument.label'),
  'tool-createDocument': t('agent.tool.createDocument.label'),
  'tool-memory': t('agent.tool.memory.label'),
};

const getToolTitle = (part: ToolPart): string => {
  return toolNames[part.type] ?? part.type.split('-').slice(1).join('-');
};

const getToolIcon = (part: ToolPart) => {
  switch (part.type) {
    case 'tool-think':
      return PencilLineIcon;
    case 'tool-linkedinDraft':
      return FileTextIcon;
    case 'tool-imageGen':
      return ImageIcon;
    case 'tool-webSearch':
      return SearchIcon;
    case 'tool-webBrowser':
      return SearchIcon;
    case 'tool-listDocuments':
      return FolderOpenIcon;
    case 'tool-readDocument':
      return FileTextIcon;
    case 'tool-editDocument':
      return FilePenIcon;
    case 'tool-createDocument':
      return FilePenIcon;
    case 'tool-memory':
      return NotebookTextIcon;
    default:
      return undefined;
  }
};

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
            <ToolHeader
              :type="part.type"
              :state="part.state"
              :title="getToolTitle(part)"
              :icon="getToolIcon(part)"
            />
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
