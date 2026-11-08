import { expect, test, type Locator, type Page } from '@playwright/test';

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

interface MockNotification {
  id: string;
  type: string;
  data: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function mockNotification(
  id: string,
  type: string,
  data: Record<string, unknown>,
  ageMs: number,
  isRead: boolean,
): MockNotification {
  const createdAt = new Date(Date.now() - ageMs).toISOString();
  return { id, type, data, readAt: isRead ? createdAt : null, createdAt };
}

async function mockNotifications(page: Page, items: MockNotification[]) {
  const withUser = (item: MockNotification) => ({ ...item, userId: 'u1' });
  await page.route(/\/notification\?/, (route) =>
    route.fulfill({
      json: { notifications: items.map(withUser), count: items.length },
    }),
  );
  await page.route('**/notification/unread-count', (route) =>
    route.fulfill({
      json: { count: items.filter((item) => item.readAt === null).length },
    }),
  );
  await page.route(/\/notification\/[\w-]+$/, async (route) => {
    if (route.request().method() !== 'DELETE') return route.fallback();
    const id = route.request().url().split('/').pop();
    const index = items.findIndex((item) => item.id === id);
    if (index >= 0) items.splice(index, 1);
    return route.fulfill({ json: { success: true } });
  });
}

function notificationsPanel(page: Page) {
  return page.getByRole('dialog').filter({ hasText: 'Notifications' });
}

function mixedNotifications(): MockNotification[] {
  return [
    mockNotification(
      'n-failed',
      'workflow_run_failed',
      {
        workflowId: 'w1',
        runId: 'r1',
        workflowName: 'Weekly report',
        workspaceId: 'x',
      },
      60 * 1000,
      false,
    ),
    mockNotification(
      'n-task',
      'task_reminder_due',
      {
        taskId: 't1',
        workspaceId: 'x',
        taskNumber: 4,
        taskTitle: 'Send invoice',
      },
      DAY_MS + 60 * 1000,
      true,
    ),
    mockNotification(
      'n-old',
      'image_generation_succeeded',
      { genImageIds: ['i1'], workspaceId: 'x', prompt: 'A red bike' },
      5 * DAY_MS,
      true,
    ),
  ];
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

  test('shows no stale tooltip after collapsing and still shows one when hovering collapsed', async ({
    page,
  }) => {
    const tooltipDelayMs = 300;
    await page.goto('/');
    const agents = sidebar(page).getByRole('link', { name: 'Agents' });
    await agents.hover();
    await page.waitForTimeout(tooltipDelayMs + 200);
    await page.getByRole('button', { name: 'Collapse sidebar' }).click();
    await expect(agentsLabel(page)).toBeHidden();

    await expect(page.getByRole('tooltip')).toHaveCount(0);

    await page.mouse.move(600, 400);
    await agents.hover();
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

const MENU_GAP = 6;
const POSITION_TOLERANCE = 2;

async function expectMenuAtRow(
  menu: Locator,
  rowBox: { x: number; y: number; width: number; height: number },
  direction: 'above' | 'below',
) {
  await expect
    .poll(async () => {
      const menuBox = await menu.boundingBox();
      if (!menuBox) return 'missing box';
      const gap =
        direction === 'below'
          ? menuBox.y - (rowBox.y + rowBox.height)
          : rowBox.y - (menuBox.y + menuBox.height);
      const dx = menuBox.x - rowBox.x;
      const isPlaced =
        Math.abs(dx) <= POSITION_TOLERANCE &&
        Math.abs(gap - MENU_GAP) <= POSITION_TOLERANCE;
      return isPlaced ? 'placed' : `dx=${dx} gap=${gap}`;
    })
    .toBe('placed');
}

test.describe('notifications panel', () => {
  test.use({ reducedMotion: 'reduce' });

  test('groups entries, marks unread ones and sets failures apart', async ({
    page,
  }) => {
    await mockNotifications(page, mixedNotifications());
    await page.goto('/');
    await sidebar(page).getByRole('button', { name: 'Notifications' }).click();
    const panel = notificationsPanel(page);

    for (const label of ['Today', 'Yesterday', 'Earlier']) {
      await expect(panel.getByText(label, { exact: true })).toBeVisible();
    }
    await expect(panel.getByTestId('notification-unread')).toHaveCount(1);
    await expect(panel.getByText('1 new')).toBeVisible();
    await expect(panel.locator('.bg-status-danger-bg')).toHaveCount(1);
  });

  test('deletes a single entry', async ({ page }) => {
    await mockNotifications(page, mixedNotifications());
    await page.goto('/');
    await sidebar(page).getByRole('button', { name: 'Notifications' }).click();
    const panel = notificationsPanel(page);
    await expect(panel.getByText('Workflow failed')).toBeVisible();

    await panel.getByText('Workflow failed').hover();
    await panel
      .getByRole('button', { name: 'Delete notification' })
      .first()
      .click();

    await expect(panel.getByText('Workflow failed')).toHaveCount(0);
  });

  test('shows no empty state while the list is still loading', async ({
    page,
  }) => {
    const items = mixedNotifications();
    await mockNotifications(page, items);
    await page.route(/\/notification\?/, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await route.fallback();
    });
    await page.goto('/');
    await sidebar(page).getByRole('button', { name: 'Notifications' }).click();
    const panel = notificationsPanel(page);

    await expect(panel).toBeVisible();
    await expect(panel.getByText('No notifications.')).toHaveCount(0);
    await expect(panel.getByText('Workflow failed')).toBeVisible();
  });

  test('explains what shows up when there are no notifications', async ({
    page,
  }) => {
    await mockNotifications(page, []);
    await page.goto('/');
    await sidebar(page).getByRole('button', { name: 'Notifications' }).click();
    const panel = notificationsPanel(page);

    await expect(panel.getByText('No notifications.')).toBeVisible();
    await expect(
      panel.getByText(/Workflow results, task reminders/),
    ).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Clear all' })).toHaveCount(
      0,
    );
  });

  test('opens each menu in the same place relative to its row in both sidebar states', async ({
    page,
  }) => {
    await mockNotifications(page, mixedNotifications());
    await page.goto('/');
    const menus = [
      {
        row: workspaceRow(page),
        menu: page.getByRole('menu'),
        direction: 'below' as const,
      },
      {
        row: sidebar(page).getByRole('button', { name: 'Notifications' }),
        menu: notificationsPanel(page),
        direction: 'above' as const,
      },
      {
        row: userRow(page),
        menu: page.getByRole('menu'),
        direction: 'above' as const,
      },
    ];

    for (const collapsed of [false, true]) {
      if (collapsed) await collapseSidebar(page);
      for (const { row, menu, direction } of menus) {
        const rowBox = await row.boundingBox();
        if (!rowBox) throw new Error('row not found');
        await row.click();
        await expectMenuAtRow(menu, rowBox, direction);
        await page.keyboard.press('Escape');
        await expect(menu).toBeHidden();
      }
    }
  });
});
