// Browser entry: nothing here may depend on @repo/database, or the frontend type-check loads the whole schema.
export { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from 'ai';
export type { GeneratedAgentImage, getGeneratedImagesOutput } from './tools/image-gen.tool';
