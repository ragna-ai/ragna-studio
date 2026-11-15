import { expect, test, type Page } from '@playwright/test';
import { z } from 'zod';

const API_URL = 'http://localhost:3110';

const profileSchema = z.object({
  user: z.object({ locale: z.string().nullable() }),
});

async function getAccountLocale(page: Page): Promise<string | null> {
  const response = await page.request.get(`${API_URL}/user/profile`);
  return profileSchema.parse(await response.json()).user.locale;
}

async function setAccountLocale(page: Page, locale: 'en' | 'de') {
  const response = await page.request.patch(`${API_URL}/user/profile`, {
    data: { locale },
  });
  expect(response.ok()).toBe(true);
}

test.describe.configure({ mode: 'serial' });

test.describe('account language', () => {
  test('stores the shown language for an account without one', async ({
    page,
  }) => {
    await page.goto('/settings/language');
    await expect(
      page.getByRole('heading', { name: 'Language', level: 1 }),
    ).toBeVisible();

    await expect.poll(() => getAccountLocale(page)).toBe('en');
  });

  test('switches the app to the account language', async ({ page }) => {
    await setAccountLocale(page, 'de');
    try {
      await page.goto('/settings/language');
      await expect(
        page.getByRole('heading', { name: 'Sprache', level: 1 }),
      ).toBeVisible();
    } finally {
      await setAccountLocale(page, 'en');
    }
  });
});
