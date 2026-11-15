import { cp, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, test } from 'bun:test';
import { renderEmail } from '../src/nodemail/render-email';

const sourceTemplates = join(import.meta.dir, '../src/templates');

// Deployed images load templates from <app>/node_modules/@repo/mail/dist/templates.
const scratch = await mkdtemp(join(tmpdir(), 'mail-templates-'));
const installedTemplates = join(scratch, 'node_modules/@repo/mail/dist/templates');
await mkdir(installedTemplates, { recursive: true });
await cp(sourceTemplates, installedTemplates, { recursive: true });

afterAll(() => rm(scratch, { recursive: true, force: true }));

describe('renderEmail', () => {
  test('welcome substitutes the name', async () => {
    const { html, plaintext } = await renderEmail('welcome', { name: 'Ada' }, installedTemplates);

    expect(html).toContain('Welcome, Ada.');
    expect(plaintext).toContain('Welcome, Ada.');
  });

  test('invitation substitutes inviter, organization and url', async () => {
    const { html, plaintext } = await renderEmail(
      'invitation',
      { inviterName: 'Ada', organizationName: 'Acme', url: 'https://app.example.test/invite/1' },
      installedTemplates,
    );

    expect(html).toContain('Ada invited you to join Acme.');
    expect(html).toContain('https://app.example.test/invite/1');
    expect(plaintext).toContain('Ada invited you to join Acme.');
  });

  test('passkey-added substitutes user, passkey and settings url', async () => {
    const { html, plaintext } = await renderEmail(
      'passkey-added',
      {
        userName: 'Ada',
        passkeyName: 'MacBook',
        settingsUrl: 'https://app.example.test/settings/profile',
      },
      installedTemplates,
    );

    for (const output of [html, plaintext]) {
      expect(output).toContain('Ada');
      expect(output).toContain('MacBook');
      expect(output).toContain('https://app.example.test/settings/profile');
    }
  });
});
