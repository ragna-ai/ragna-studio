import { expect, test, type Page } from '@playwright/test';

const PASSKEY_NAME = 'Laptop';
const RENAMED_PASSKEY_NAME = 'Work laptop';

/** Chromium virtual authenticator: a platform passkey that auto-verifies the user. */
async function addVirtualAuthenticator(page: Page): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
}

async function openPasskeysSettings(page: Page): Promise<void> {
  await page.goto('/settings/profile');
  await page
    .getByRole('navigation', { name: 'Settings' })
    .getByRole('link', { name: 'Passkeys' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Passkeys', level: 1 }),
  ).toBeVisible();
}

test.describe('passkeys', () => {
  test('adds a passkey, signs in with it, renames and deletes it', async ({
    page,
  }) => {
    await addVirtualAuthenticator(page);

    await openPasskeysSettings(page);
    await expect(page.getByText('You have no passkeys yet.')).toBeVisible();
    await page.getByRole('button', { name: 'Add a passkey' }).click();
    await page.getByRole('dialog').getByLabel('Name').fill(PASSKEY_NAME);
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Add passkey' })
      .click();
    await expect(page.getByText(PASSKEY_NAME, { exact: true })).toBeVisible();

    // Drop the session cookie only: signing out would end the session
    // every other spec shares.
    await page.context().clearCookies();
    await page.goto('/auth/login');
    await page.getByRole('button', { name: 'Sign in with a passkey' }).click();
    await expect(page).toHaveURL(/localhost:3100\/$/);

    await openPasskeysSettings(page);
    await page.getByRole('button', { name: `Rename ${PASSKEY_NAME}` }).click();
    await page
      .getByRole('dialog')
      .getByLabel('Name')
      .fill(RENAMED_PASSKEY_NAME);
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Save' })
      .click();
    await expect(
      page.getByText(RENAMED_PASSKEY_NAME, { exact: true }),
    ).toBeVisible();

    await page
      .getByRole('button', { name: `Delete ${RENAMED_PASSKEY_NAME}` })
      .click();
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Delete' })
      .click();
    await expect(page.getByText('You have no passkeys yet.')).toBeVisible();
  });
});
