import { existsSync, readFileSync, writeFileSync } from 'node:fs';

// Every form dotenv reads: optional indent, optional `export`, spaces around `=`.
const APP_KEY_LINE = /^[ \t]*(?:export[ \t]+)?APP_KEY[ \t]*=(.*)$/m;
const OWNER_ONLY_MODE = 0o600;
const SURROUNDING_QUOTES = /^["']|["']$/g;

export type AppKeyWriteOutcome = 'written' | 'kept';

export interface WriteAppKeyParams {
  envFilePath: string;
  key: string;
  force: boolean;
}

/**
 * Writes APP_KEY into a local env file. An existing key is kept unless forced, because replacing
 * it makes every secret encrypted with it unreadable.
 */
export function writeAppKeyToEnvFile({
  envFilePath,
  key,
  force,
}: WriteAppKeyParams): AppKeyWriteOutcome {
  const content = existsSync(envFilePath) ? readFileSync(envFilePath, 'utf8') : '';
  const existingLine = APP_KEY_LINE.exec(content);

  if (existingLine && hasValue(existingLine[1]) && !force) {
    return 'kept';
  }

  const keyLine = `APP_KEY="${key}"`;
  const updated = existingLine
    ? content.replace(APP_KEY_LINE, () => keyLine)
    : appendLine(content, keyLine);
  // `mode` only applies when the file is created; an existing file keeps its permissions.
  writeFileSync(envFilePath, updated, { mode: OWNER_ONLY_MODE });
  return 'written';
}

function hasValue(rawValue: string | undefined): boolean {
  const value = (rawValue ?? '').trim().replace(SURROUNDING_QUOTES, '');
  return value.length > 0;
}

function appendLine(content: string, line: string): string {
  if (content.length === 0 || content.endsWith('\n')) {
    return `${content}${line}\n`;
  }
  return `${content}\n${line}\n`;
}
