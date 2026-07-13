const PLACEHOLDER_PATTERN = /\{\{\s*([^{}\s]+)\s*\}\}/g;

export type TemplateContext = {
  input: string;
};

// Replaces {{input}} placeholders with the node's resolved input (the
// engine computes this as the upstream node's output, or the run input for
// the first node). Unknown placeholders (typos) resolve to an empty string
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
  return '';
}
