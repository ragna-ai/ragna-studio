import { cp, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, test } from 'bun:test';
import type { UserLocale } from '@repo/utils';
import { renderTransactionalEmail } from '../src/nodemail/render-email';
import type { TransactionalEmail } from '../src/transactional';

const sourceTemplates = join(import.meta.dir, '../src/templates');

// Deployed images load templates from <app>/node_modules/@repo/mail/dist/templates.
const scratch = await mkdtemp(join(tmpdir(), 'mail-templates-'));
const installedTemplates = join(scratch, 'node_modules/@repo/mail/dist/templates');
await mkdir(installedTemplates, { recursive: true });
await cp(sourceTemplates, installedTemplates, { recursive: true });

afterAll(() => rm(scratch, { recursive: true, force: true }));

const to = 'ada@example.test';

const welcome: TransactionalEmail = { id: 'welcome', variables: { name: 'Ada' } };
const invitation: TransactionalEmail = {
  id: 'invitation',
  variables: {
    inviterName: 'Ada',
    organizationName: 'Acme',
    url: 'https://app.example.test/invite/1',
  },
};
const passkeyAdded: TransactionalEmail = {
  id: 'passkey-added',
  variables: {
    userName: 'Ada',
    passkeyName: 'MacBook',
    settingsUrl: 'https://app.example.test/settings/passkeys',
  },
};

interface ExpectedCopy {
  email: TransactionalEmail;
  locale: UserLocale;
  subject: string;
  heading: string;
  paragraph: string;
  recipientLine: string;
  actionUrl?: string;
}

const cases: ExpectedCopy[] = [
  {
    email: welcome,
    locale: 'en',
    subject: 'Welcome to RAGNA Studio',
    heading: 'Welcome, Ada.',
    paragraph: 'Thanks for joining RAGNA Studio.',
    recipientLine:
      'This email was sent to ada@example.test because you created a RAGNA Studio account.',
  },
  {
    email: welcome,
    locale: 'de',
    subject: 'Willkommen bei RAGNA Studio',
    heading: 'Willkommen, Ada.',
    paragraph: 'Schön, dass du bei RAGNA Studio bist.',
    recipientLine:
      'Diese E-Mail wurde an ada@example.test gesendet, weil du ein Konto bei RAGNA Studio erstellt hast.',
  },
  {
    email: invitation,
    locale: 'en',
    subject: 'Ada invited you to Acme',
    heading: 'Ada invited you to join Acme.',
    paragraph: 'Sign in with this email address to join.',
    recipientLine:
      "This email was sent to ada@example.test because Ada invited you. If you didn't expect an invitation, you can ignore it.",
    actionUrl: 'https://app.example.test/invite/1',
  },
  {
    email: invitation,
    locale: 'de',
    subject: 'Ada hat dich zu Acme eingeladen',
    heading: 'Ada hat dich eingeladen, Acme beizutreten.',
    paragraph: 'Melde dich mit dieser E-Mail-Adresse an.',
    recipientLine:
      'Diese E-Mail wurde an ada@example.test gesendet, weil Ada dich eingeladen hat. Wenn du keine Einladung erwartet hast, kannst du sie ignorieren.',
    actionUrl: 'https://app.example.test/invite/1',
  },
  {
    email: passkeyAdded,
    locale: 'en',
    subject: 'A passkey was added to your RAGNA Studio account',
    heading: 'Hi Ada,',
    paragraph: 'A passkey named MacBook was added to your account.',
    recipientLine:
      'This email was sent to ada@example.test to let you know about an important change to your account.',
    actionUrl: 'https://app.example.test/settings/passkeys',
  },
  {
    email: passkeyAdded,
    locale: 'de',
    subject: 'Neuer Passkey in deinem Konto bei RAGNA Studio',
    heading: 'Hallo Ada,',
    paragraph: 'Ein Passkey namens MacBook wurde zu deinem Konto hinzugefügt.',
    recipientLine:
      'Diese E-Mail wurde an ada@example.test gesendet, um dich über eine wichtige Änderung an deinem Konto zu informieren.',
    actionUrl: 'https://app.example.test/settings/passkeys',
  },
];

describe('renderTransactionalEmail', () => {
  test.each(cases)('$email.id in $locale', async (expected) => {
    const { subject, html, plaintext } = await renderTransactionalEmail(
      { to, locale: expected.locale, email: expected.email },
      installedTemplates,
    );

    expect(subject).toBe(expected.subject);
    expect(html).toContain(`lang="${expected.locale}"`);
    for (const output of [html, plaintext]) {
      expect(output).toContain(expected.heading);
      expect(output).toContain(expected.paragraph);
    }
    expect(plaintext).toContain(expected.recipientLine);
    if (expected.actionUrl) {
      expect(html).toContain(expected.actionUrl);
    }
  });

  test('escapes HTML in names', async () => {
    const { html } = await renderTransactionalEmail(
      { to, locale: 'en', email: { id: 'welcome', variables: { name: '<b>Ada</b>' } } },
      installedTemplates,
    );

    expect(html).toContain('&lt;b&gt;Ada&lt;/b&gt;');
    expect(html).not.toContain('<b>Ada</b>');
  });

  test('escapes HTML in the recipient address', async () => {
    const { html } = await renderTransactionalEmail(
      { to: '<b>ada</b>@example.test', locale: 'en', email: welcome },
      installedTemplates,
    );

    expect(html).toContain('&lt;b&gt;ada&lt;/b&gt;@example.test');
    expect(html).not.toContain('<b>ada</b>');
  });

  test.each(cases)('$email.id in $locale loads no remote files', async (expected) => {
    const { html } = await renderTransactionalEmail(
      { to, locale: expected.locale, email: expected.email },
      installedTemplates,
    );

    expect(html).not.toMatch(/<img|<link|@font-face|url\(|\ssrc=/i);
  });

  test.each(cases)('$email.id in $locale uses hex colours and stays small', async (expected) => {
    const { html } = await renderTransactionalEmail(
      { to, locale: expected.locale, email: expected.email },
      installedTemplates,
    );

    expect(html).not.toMatch(/oklch\(|oklab\(|rgba?\(|hsla?\(|color-mix\(/i);
    // Gmail clips messages above about 102 KB.
    expect(new TextEncoder().encode(html).length).toBeLessThan(30_000);
  });
});
