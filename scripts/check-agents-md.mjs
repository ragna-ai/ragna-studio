#!/usr/bin/env node
// Fails when AGENTS.md and the workspace drift apart: an app or package missing from the map, a name in
// AGENTS.md that no longer exists, or a package.json without a description.
// Run: pnpm check:agents-md

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const rootDir = join(import.meta.dirname, '..');
const agentsMd = readFileSync(join(rootDir, 'AGENTS.md'), 'utf8');

/** Workspace folders under apps/ or packages/ that hold a package.json. */
function readWorkspace(folder) {
  return readdirSync(join(rootDir, folder), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ dir: entry.name, path: join(rootDir, folder, entry.name, 'package.json') }))
    .filter((workspace) => existsSync(workspace.path))
    .map((workspace) => ({
      ...workspace,
      manifest: JSON.parse(readFileSync(workspace.path, 'utf8')),
    }));
}

const apps = readWorkspace('apps');
const packages = readWorkspace('packages');
const errors = [];

for (const workspace of [...apps, ...packages]) {
  if (!workspace.manifest.description) {
    errors.push(`${workspace.manifest.name} has no "description" in its package.json`);
  }
}

const mentionedNames = new Set([...agentsMd.matchAll(/@repo\/[a-z0-9-]+/g)].map(([name]) => name));
const mentionedPaths = new Set(
  [...agentsMd.matchAll(/\b(?:apps|packages)\/[a-z0-9-]+/g)].map(([path]) => path),
);

for (const app of apps) {
  if (!mentionedPaths.has(`apps/${app.dir}`))
    errors.push(`AGENTS.md doesn't mention apps/${app.dir}`);
}

for (const pkg of packages) {
  if (!mentionedNames.has(pkg.manifest.name))
    errors.push(`AGENTS.md doesn't mention ${pkg.manifest.name}`);
}

const workspaceNames = new Set([...apps, ...packages].map((workspace) => workspace.manifest.name));
for (const name of mentionedNames) {
  if (!workspaceNames.has(name))
    errors.push(`AGENTS.md names ${name}, which is not a workspace package`);
}

for (const path of mentionedPaths) {
  if (!existsSync(join(rootDir, path))) errors.push(`AGENTS.md names ${path}, which doesn't exist`);
}

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`AGENTS.md covers ${apps.length} apps and ${packages.length} packages`);
