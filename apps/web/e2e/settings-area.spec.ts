import { expect, test, type Page } from '@playwright/test';
import { MEMBER_STORAGE_STATE_PATH } from '../playwright.config';

const INTEGRATION_ERROR_QUERY_PARAM = 'integration_error';
const PRIVATE_WORKSPACE_TITLE = 'Mail lives in your private workspace';
const PRIVATE_WORKSPACE_SWITCH = 'Switch to your private workspace';

async function openSettingsFromUserMenu(page: Page) {
  await page.getByRole('complementary').getByRole('button').last().click();
  await page.getByRole('menuitem', { name: 'Settings' }).click();
}

function settingsNav(page: Page) {
  return page.getByRole('navigation', { name: 'Settings' });
}

test.describe('as organization owner', () => {
  test('opens settings on the profile from the user menu', async ({ page }) => {
    await page.goto('/tasks');
    await openSettingsFromUserMenu(page);

    await expect(page).toHaveURL(/\/settings\/profile$/);
    await expect(settingsNav(page)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Agents' })).toHaveCount(0);
  });

  test('keeps the section in the address across a reload', async ({ page }) => {
    await page.goto('/settings/profile');
    await settingsNav(page).getByRole('link', { name: 'Language' }).click();
    await expect(page).toHaveURL(/\/settings\/language$/);

    await page.reload();
    await expect(page).toHaveURL(/\/settings\/language$/);
    await expect(
      page.getByRole('heading', { name: 'Language', level: 1 }),
    ).toBeVisible();
  });

  test('returns to the page settings were opened from', async ({ page }) => {
    await page.goto('/tasks');
    await openSettingsFromUserMenu(page);
    await page.getByRole('link', { name: 'Back to app' }).click();

    await expect(page).toHaveURL(/\/tasks$/);
  });

  test('returns home when settings were opened directly', async ({ page }) => {
    await page.goto('/settings/credits');
    await page.getByRole('link', { name: 'Back to app' }).click();

    await expect(page).toHaveURL(/\/$/);
  });

  test('shows the management sections to an owner', async ({ page }) => {
    await page.goto('/settings/profile');

    await expect(
      settingsNav(page).getByRole('link', { name: 'Workspaces' }),
    ).toBeVisible();
    await expect(
      settingsNav(page).getByRole('link', { name: 'Usage' }),
    ).toBeVisible();
  });

  test('hides the MCP section when the connector is off', async ({ page }) => {
    await page.route('**/mcp-settings', (route) =>
      route.fulfill({ status: 404, json: {} }),
    );
    await page.goto('/settings/profile');

    await expect(
      settingsNav(page).getByRole('link', { name: 'Connections' }),
    ).toBeVisible();
    await expect(
      settingsNav(page).getByRole('link', { name: 'MCP' }),
    ).toHaveCount(0);
  });

  test('redirects the old account address to the profile', async ({ page }) => {
    await page.goto('/account');

    await expect(page).toHaveURL(/\/settings\/profile$/);
  });

  test('shows the integration error on the connections section', async ({
    page,
  }) => {
    await page.goto(
      `/settings/connections?${INTEGRATION_ERROR_QUERY_PARAM}=access_denied`,
    );

    await expect(page).toHaveURL(/\/settings\/connections$/);
    await expect(page.getByText('You did not allow access.')).toBeVisible();
  });

  test('redirects the old mail settings address to the email section', async ({
    page,
  }) => {
    await page.goto('/mail/settings');

    await expect(page).toHaveURL(/\/settings\/mail$/);
    await expect(settingsNav(page)).toBeVisible();
  });

  test('offers the switch to the private workspace in the email section', async ({
    page,
  }) => {
    await page.goto('/settings/mail');

    await expect(
      page.getByRole('heading', { name: PRIVATE_WORKSPACE_TITLE }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: PRIVATE_WORKSPACE_SWITCH }),
    ).toBeVisible();
  });

  test('opens the MCP section from a direct link', async ({ page }) => {
    await page.goto('/settings/mcp');

    await expect(page).toHaveURL(/\/settings\/mcp$/);
    await expect(settingsNav(page)).toBeVisible();
  });
});

test.describe('as organization member', () => {
  test.use({ storageState: MEMBER_STORAGE_STATE_PATH });

  test('hides the management sections', async ({ page }) => {
    await page.goto('/settings/profile');

    await expect(
      settingsNav(page).getByRole('link', { name: 'Members' }),
    ).toBeVisible();
    await expect(
      settingsNav(page).getByRole('link', { name: 'Workspaces' }),
    ).toHaveCount(0);
    await expect(
      settingsNav(page).getByRole('link', { name: 'Usage' }),
    ).toHaveCount(0);
  });

  for (const section of ['workspaces', 'usage']) {
    test(`redirects ${section} to the general section`, async ({ page }) => {
      await page.goto(`/settings/organization/${section}`);

      await expect(page).toHaveURL(/\/settings\/organization$/);
    });
  }
});
