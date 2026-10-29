import { resolve } from 'node:path';
import { findRepoRoot } from '@repo/config';
import { generateAppKey } from '../keys/app-key';
import { writeAppKeyToEnvFile } from '../keys/env-file';

// Local dev only: production keeps APP_KEY in its secret store and never regenerates it.
function main(): void {
  const args = process.argv.slice(2);
  const key = generateAppKey();

  if (args.includes('--show')) {
    console.log(key);
    return;
  }

  const envFilePath = resolve(findRepoRoot(process.cwd()), '.env');
  const outcome = writeAppKeyToEnvFile({ envFilePath, key, force: args.includes('--force') });

  if (outcome === 'kept') {
    console.error(
      'APP_KEY is already set in .env. Replacing it makes every stored connection unreadable. ' +
        'Pass --force to replace it anyway, or --show to only print a new key.',
    );
    process.exitCode = 1;
    return;
  }

  console.log(`APP_KEY written to ${envFilePath}`);
}

main();
