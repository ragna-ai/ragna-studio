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

function workspaceRow(page: Page, name?: string) {
  return sidebar(page).getByRole('button').first().filter({
    hasText: name,
  });
}

function searchField(page: Page) {
  return sidebar(page).getByRole('button', { name: 'Search' });
}

async function openWorkspaceMenu(page: Page) {
  await workspaceRow(page).click();
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

  test('opens the user menu on click and not on hover', async ({ page }) => {
    await page.goto('/');
    await userRow(page).hover();
    await expect(page.getByRole('menu')).toHaveCount(0);

    await userRow(page).click();
    await expect(page.getByRole('menu')).toBeVisible();
  });

  test('offers no workspace switching in the user menu', async ({ page }) => {
    await page.goto('/');
    await openUserMenu(page);

    await expect(page.getByRole('menu')).toBeVisible();
    await expect(
      page.getByRole('menuitem', { name: 'Add workspace' }),
    ).toHaveCount(0);
    await expect(page.getByText('Workspace', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('menuitem', { name: 'Help' })).toHaveCount(0);
  });

  test('shows the app version and opens settings from the user menu', async ({
    page,
  }) => {
    await page.goto('/');
    await openUserMenu(page);
    await expect(page.getByText(/^Version /)).toBeVisible();

    await page.getByRole('menuitem', { name: 'Settings' }).click();
    await expect(page).toHaveURL(/\/settings\/profile$/);
  });

  test('switches workspace from the workspace row', async ({ page }) => {
    await page.goto('/');
    await openWorkspaceMenu(page);
    await page.getByRole('menuitem', { name: 'Add workspace' }).click();
    await page.getByRole('dialog').getByLabel('Name').fill(NEW_WORKSPACE_NAME);
    await page.getByRole('button', { name: 'Create workspace' }).click();

    await openWorkspaceMenu(page);
    await page.getByRole('menuitem', { name: NEW_WORKSPACE_NAME }).click();

    await expect(workspaceRow(page, NEW_WORKSPACE_NAME)).toBeVisible();
  });

  test('toggles the sidebar with the keyboard', async ({ page }) => {
    await page.goto('/');
    await collapseSidebar(page);
    const toggle = page.getByRole('button', { name: 'Expand sidebar' });
    await toggle.focus();
    await toggle.press('Enter');

    await expect(agentsLabel(page)).toBeVisible();
  });

  test('lists workspace, search, navigation, notifications and user top to bottom', async ({
    page,
  }) => {
    await page.goto('/');
    const tops: number[] = [];
    for (const locator of [
      sidebar(page).getByRole('button').first(),
      searchField(page),
      sidebar(page).getByRole('link', { name: 'Dashboard' }),
      sidebar(page).getByRole('link', { name: 'Social' }),
      sidebar(page).getByRole('button', { name: 'Notifications' }),
      userRow(page),
    ]) {
      const box = await locator.boundingBox();
      expect(box).not.toBeNull();
      tops.push(box?.y ?? 0);
    }

    expect(tops).toEqual([...tops].sort((a, b) => a - b));
  });

  test('opens the workspace menu from the workspace row', async ({ page }) => {
    await page.goto('/');
    await openWorkspaceMenu(page);

    await expect(
      page.getByRole('menuitem', { name: 'Manage workspaces' }),
    ).toBeVisible();
    await expect(
      page.getByRole('menuitem', { name: 'Add workspace' }),
    ).toBeVisible();
  });

  test('shows the user name and organization role in the user row', async ({
    page,
  }) => {
    await page.goto('/');

    await expect(userRow(page)).toContainText('Owner');
  });

  test('shows unread notifications as a count and as a dot when collapsed', async ({
    page,
  }) => {
    await page.route('**/notification/unread-count', (route) =>
      route.fulfill({ json: { count: 3 } }),
    );
    await page.goto('/');
    await expect(page.getByTestId('notification-count')).toHaveText('3');

    await collapseSidebar(page);
    await expect(page.getByTestId('notification-dot')).toBeVisible();
    await expect(page.getByTestId('notification-count')).toHaveCount(0);
  });

  test('reports the search field as disabled and does nothing on click', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(searchField(page)).toHaveAttribute('aria-disabled', 'true');
    await expect(searchField(page)).toBeDisabled();
    await searchField(page).click({ force: true });

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('shows a focus ring on a keyboard-focused item', async ({ page }) => {
    await page.goto('/');
    const link = sidebar(page).getByRole('link', { name: 'Agents' });
    await link.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');

    await expect(link).toBeFocused();
    await expect(link).not.toHaveCSS('box-shadow', 'none');
  });
});

test.describe('app sidebar in a narrow window', () => {
  test.use({ viewport: { width: 900, height: 800 } });

  test('starts collapsed without a saved preference', async ({ page }) => {
    await page.goto('/');

    await expect(
      page.getByRole('button', { name: 'Expand sidebar' }),
    ).toBeVisible();
    await expect(agentsLabel(page)).toBeHidden();
  });

  test('keeps a saved expanded preference', async ({ page }) => {
    await page.addInitScript(
      (key) => localStorage.setItem(key, 'true'),
      EXPANDED_KEY,
    );
    await page.goto('/');

    await expect(agentsLabel(page)).toBeVisible();
  });
});
