import { expect, test, type Page } from '@playwright/test';

const REMOVED_SHOW_LABELS_KEY = 'nav-sidebar:show-labels-when-collapsed';
const EXPANDED_KEY = 'nav-sidebar:expanded';

function sidebar(page: Page) {
  return page.getByRole('complementary');
}

const NEW_WORKSPACE_NAME = 'E2E Second Space';

function userRow(page: Page) {
  return sidebar(page).getByRole('button').last();
}

async function openUserMenu(page: Page) {
  await userRow(page).click();
}

function workspaceSubmenuTrigger(page: Page) {
  return page.getByRole('menu').getByRole('menuitem').first();
}

function agentsLabel(page: Page) {
  return sidebar(page).getByText('Agents', { exact: true });
}

async function collapseSidebar(page: Page) {
  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  await expect(agentsLabel(page)).toBeHidden();
}

test.describe('app sidebar', () => {
  test('is expanded for a user who never toggled it', async ({ page }) => {
    await page.goto('/');

    await expect(agentsLabel(page)).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Collapse sidebar' }),
    ).toBeVisible();
  });

  test('shows labels everywhere when expanded and icons only when collapsed', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(
      sidebar(page).getByText('Notifications', { exact: true }),
    ).toBeVisible();
    await expect(
      sidebar(page).getByRole('button', { name: 'Notifications' }),
    ).toContainText('Notifications');

    await collapseSidebar(page);
    await expect(
      sidebar(page).getByText('Notifications', { exact: true }),
    ).toBeHidden();

    await page.getByRole('button', { name: 'Expand sidebar' }).click();
    await expect(agentsLabel(page)).toBeVisible();
  });

  test('keeps the expanded state after a reload', async ({ page }) => {
    await page.goto('/');
    await collapseSidebar(page);
    await page.getByRole('button', { name: 'Expand sidebar' }).click();
    await page.reload();

    await expect(
      page.getByRole('button', { name: 'Collapse sidebar' }),
    ).toBeVisible();
  });

  test('shows a tooltip with the item name when collapsed', async ({
    page,
  }) => {
    await page.goto('/');
    await collapseSidebar(page);
    await sidebar(page).getByRole('link', { name: 'Agents' }).hover();

    await expect(page.getByRole('tooltip', { name: 'Agents' })).toBeVisible();
  });

  test('shows icons only for a user who had turned on show-labels', async ({
    page,
  }) => {
    await page.addInitScript(
      ([removedKey, expandedKey]) => {
        localStorage.setItem(removedKey, 'true');
        localStorage.setItem(expandedKey, 'false');
      },
      [REMOVED_SHOW_LABELS_KEY, EXPANDED_KEY],
    );
    await page.goto('/');

    await expect(
      sidebar(page).getByRole('link', { name: 'Agents' }),
    ).toBeVisible();
    await expect(agentsLabel(page)).toBeHidden();
    expect(
      await page.evaluate(
        (key) => localStorage.getItem(key),
        REMOVED_SHOW_LABELS_KEY,
      ),
    ).toBeNull();
  });

  test('groups the nav with labels when expanded and without when collapsed', async ({
    page,
  }) => {
    await page.goto('/');
    for (const groupLabel of ['Work', 'AI', 'Create']) {
      await expect(
        sidebar(page).getByText(groupLabel, { exact: true }),
      ).toBeVisible();
    }

    await collapseSidebar(page);
    for (const groupLabel of ['Work', 'AI', 'Create']) {
      await expect(
        sidebar(page).getByText(groupLabel, { exact: true }),
      ).toBeHidden();
    }
    await expect(
      sidebar(page).getByRole('link', { name: 'Tasks' }),
    ).toBeVisible();
  });

  test('opens settings and help from the user menu', async ({ page }) => {
    await page.goto('/');
    await openUserMenu(page);
    await page.getByRole('menuitem', { name: 'Help' }).click();
    await expect(page.getByText(/App version:/)).toBeVisible();

    await page.getByRole('menuitem', { name: 'Settings' }).click();
    await expect(page).toHaveURL(/\/settings\/profile$/);
  });

  test('switches workspace from the user menu', async ({ page }) => {
    await page.goto('/');
    await openUserMenu(page);
    await workspaceSubmenuTrigger(page).hover();
    await page.getByRole('menuitem', { name: 'Add workspace' }).click();
    await page.getByRole('dialog').getByLabel('Name').fill(NEW_WORKSPACE_NAME);
    await page.getByRole('button', { name: 'Create workspace' }).click();

    await openUserMenu(page);
    await workspaceSubmenuTrigger(page).hover();
    await page.getByRole('menuitem', { name: NEW_WORKSPACE_NAME }).click();

    await expect(
      userRow(page).getByText(NEW_WORKSPACE_NAME, { exact: true }),
    ).toBeVisible();
  });

  test('toggles the sidebar with the keyboard', async ({ page }) => {
    await page.goto('/');
    await collapseSidebar(page);
    const toggle = page.getByRole('button', { name: 'Expand sidebar' });
    await toggle.focus();
    await toggle.press('Enter');

    await expect(agentsLabel(page)).toBeVisible();
  });
});
