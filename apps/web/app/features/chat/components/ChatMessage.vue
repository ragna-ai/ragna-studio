<script setup lang="ts">
import {
  FilePenIcon,
  FileTextIcon,
  FolderOpenIcon,
  ImageIcon,
  NotebookTextIcon,
  PencilLineIcon,
  SearchIcon,
  VideoIcon,
} from '@lucide/vue';
import type { GeneratedAgentImage, getGeneratedImagesOutput } from '@repo/ai';
import type { UIMessage } from 'ai';
import { isFileUIPart, isStaticToolUIPart } from 'ai';
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
import { isImageMediaType } from '~/features/chat/lib/attachment-mime';

interface Props {
  message: UIMessage;
}

defineProps<Props>();

// Composables
const { t } = useI18n();
const apiBaseUrl = useRuntimeConfig().public.apiBaseUrl;

// Functions
type ToolPart = { type: string; state: string; output?: unknown };

// Document file parts carry a relative, env-independent API download path
// (`/workspace/:id/media/:id/download`, apps/api media.service.ts), never
// stored or sent as absolute (the server-side model resolution regex
// depends on that shape). Resolve it against the API origin only for
// display here; image parts already carry an absolute CDN url and pass
// through unchanged.
function resolveAttachmentHref(url: string): string {
  return url.startsWith('/') ? `${apiBaseUrl}${url}` : url;
}

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
  'tool-videoGen': t('agent.tool.videoGen.label'),
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
    case 'tool-videoGen':
      return VideoIcon;
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
          v-else-if="part.type === 'reasoning' && (part.state === 'streaming' || part.text.trim())"
          :is-streaming="part.state === 'streaming'"
        >
          <ReasoningTrigger />
          <ReasoningContent :content="part.text" />
        </Reasoning>

        <!-- User-attached files (docs/media-library/prd.md, decision 5).
             Assistant-side file rendering is out of scope for v1. -->
        <template v-else-if="isFileUIPart(part) && message.role === 'user'">
          <img
            v-if="isImageMediaType(part.mediaType)"
            :src="part.url"
            :alt="part.filename || 'attachment'"
            class="max-h-64 w-auto rounded-lg"
          />
          <a
            v-else
            :href="resolveAttachmentHref(part.url)"
            target="_blank"
            rel="noopener noreferrer"
            class="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm hover:bg-accent"
          >
            <FileTextIcon class="size-4 shrink-0 text-muted-foreground" />
            <span class="truncate">{{ part.filename || part.url }}</span>
          </a>
        </template>

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
