export const FALLBACK_TOOL_ICON = 'hugeicons:wrench-01';

// Keyed by the bare tool id (a tool-* UIMessage part's `type` minus the
// `tool-` prefix), one entry per id in agent.tool.* (i18n locales) /
// AGENT_TOOL_CATALOG (@repo/ai/client).
export const TOOL_ICONS: Record<string, string> = {
  think: 'hugeicons:ai-brain-01',
  linkedinDraft: 'hugeicons:linkedin-01',
  imageGen: 'hugeicons:image-01',
  videoGen: 'hugeicons:video-replay',
  webSearch: 'hugeicons:globe-02',
  webBrowser: 'hugeicons:web-design-01',
  listDocuments: 'hugeicons:file-02',
  readDocument: 'hugeicons:file-02',
  editDocument: 'hugeicons:file-02',
  createDocument: 'hugeicons:file-02',
  searchContextDocuments: 'hugeicons:file-02',
  memory: 'hugeicons:notebook-02',
  datasetCreate: 'hugeicons:grid-table',
  datasetFind: 'hugeicons:grid-table',
  datasetListRows: 'hugeicons:grid-table',
  datasetGetRow: 'hugeicons:grid-table',
  datasetAppendRow: 'hugeicons:grid-table',
  datasetUpdateRow: 'hugeicons:grid-table',
  datasetMoveRow: 'hugeicons:grid-table',
  listTasks: 'hugeicons:check-list',
  readTask: 'hugeicons:check-list',
  createTask: 'hugeicons:check-list',
  updateTask: 'hugeicons:check-list',
  moveTask: 'hugeicons:check-list',
};
