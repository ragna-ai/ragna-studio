#!/usr/bin/env node
// Fails when the web app's type-check loads a server-only package. A lint rule
// on direct imports misses the indirect case: one leaked drizzle into the web
// type-check through a package entry and made it take about 10 minutes.
// Needs apps/web/.nuxt, so run it after `pnpm check-types`.
// Run: pnpm check:web-type-graph

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const webDir = join(import.meta.dirname, '..', 'apps', 'web');
const appTsconfig = join(webDir, '.nuxt', 'tsconfig.app.json');

const SERVER_ONLY_PACKAGES = [
  '@repo/config',
  '@repo/database',
  '@repo/queue',
  '@repo/storage',
  '@types/nodemailer',
  'bullmq',
  'drizzle-orm',
  's3mini',
];

const WORKSPACE_SCOPE = '@repo/';

/** Injected workspace copies sit under node_modules, linked ones resolve to packages/. */
function packagePaths(name) {
  const paths = [`/node_modules/${name}/`];
  if (name.startsWith(WORKSPACE_SCOPE)) {
    paths.push(`/packages/${name.slice(WORKSPACE_SCOPE.length)}/`);
  }
  return paths;
}

function isFromPackage(file, name) {
  return packagePaths(name).some((path) => file.includes(path));
}

function listTypeCheckedFiles() {
  const output = execFileSync(
    'pnpm',
    ['exec', 'vue-tsc', '--noEmit', '-p', appTsconfig, '--listFilesOnly'],
    { cwd: webDir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  return output.split('\n').filter(Boolean);
}

function findLeaks(files) {
  return SERVER_ONLY_PACKAGES.map((name) => ({
    name,
    files: files.filter((file) => isFromPackage(file, name)),
  })).filter((leak) => leak.files.length > 0);
}

if (!existsSync(appTsconfig)) {
  console.error(`Missing ${appTsconfig}. Run \`pnpm check-types\` first.`);
  process.exit(1);
}

const files = listTypeCheckedFiles();
const leaks = findLeaks(files);

if (leaks.length === 0) {
  console.log(`Web type-check loads no server-only packages (${files.length} files).`);
  process.exit(0);
}

console.error('The web type-check loads server-only packages:');
for (const leak of leaks) {
  console.error(`\n  ${leak.name} (${leak.files.length} files), e.g.`);
  for (const file of leak.files.slice(0, 3)) {
    console.error(`    ${file}`);
  }
}
console.error(
  '\nImport a browser-safe entry instead (e.g. @repo/ai/client), or move the code out of the package entry the web app uses.',
);
process.exit(1);
