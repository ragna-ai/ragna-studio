export const assistantTools = ['think', 'webSearch', 'webBrowser'] as const;

export type AssistantTool = (typeof assistantTools)[number];
export type AssistantTools = AssistantTool[];
