const PLACEHOLDER_PATTERN = /\{\{\s*([^{}\s]+)\s*\}\}/g;
const NODE_OUTPUT_PREFIX = 'nodes.';

export type TemplateContext = {
  input: string;
  nodes: Record<string, string>;
};

// Replaces {{input}} and {{nodes.<nodeId>}} placeholders. Unknown
// placeholders (typos, not-yet-executed nodes) resolve to an empty string
// rather than throwing, so a partial run still produces readable output.
export function resolveTemplate(template: string, ctx: TemplateContext): string {
  return template.replace(PLACEHOLDER_PATTERN, (_match, placeholder: string) =>
    resolvePlaceholder(placeholder, ctx),
  );
}

function resolvePlaceholder(placeholder: string, ctx: TemplateContext): string {
  if (placeholder === 'input') {
    return ctx.input;
  }
  if (placeholder.startsWith(NODE_OUTPUT_PREFIX)) {
    const nodeId = placeholder.slice(NODE_OUTPUT_PREFIX.length);
    return ctx.nodes[nodeId] ?? '';
  }
  return '';
}
