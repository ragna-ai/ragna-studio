import type { DocumentExport, ExportFile } from './types';

const MARKDOWN_CONTENT_TYPE = 'text/markdown; charset=utf-8';

/**
 * Markdown writer for documents:
 * `# <title>` heading, blank line, then the
 * stored content verbatim (it's already markdown). No dependency, no
 * parsing needed. An empty document still exports a title-only file
 * (decision 3).
 */
export async function toDocumentMarkdown({ title, markdown }: DocumentExport): Promise<ExportFile> {
  const bytes = new TextEncoder().encode(`# ${title}\n\n${markdown}`);

  return { bytes, contentType: MARKDOWN_CONTENT_TYPE };
}
