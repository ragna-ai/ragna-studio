import { expect, test, type Page } from '@playwright/test';

const EXPANDED_KEY = 'nav-sidebar:expanded';

function topBar(page: Page) {
  return page.getByRole('banner', { name: 'Top bar' });
}

async function toggleOffset(page: Page, name: string) {
  return topBar(page).evaluate((bar, label) => {
    const button = bar.querySelector(`button[aria-label="${label}"]`);
    if (!button) throw new Error(`${label} button missing`);
    const barRect = bar.getBoundingClientRect();
    const rect = button.getBoundingClientRect();
    return { x: rect.x - barRect.x, y: rect.y - barRect.y };
  }, name);
}

test.describe('app shell', () => {
  test.use({ reducedMotion: 'reduce' });

  test('shows the page in an inset panel with the sidebar toggle in the top bar', async ({
    page,
  }) => {
    await page.goto('/');

    const bar = topBar(page);
    await expect(
      bar.getByRole('button', { name: 'Collapse sidebar' }),
    ).toBeVisible();

    const panel = page.getByTestId('shell-panel');
    const box = await panel.boundingBox();
    const viewport = page.viewportSize();
    if (!box || !viewport) throw new Error('panel or viewport missing');
    expect(box.y).toBeGreaterThanOrEqual(8);
    expect(viewport.width - (box.x + box.width)).toBeGreaterThanOrEqual(8);
    expect(viewport.height - (box.y + box.height)).toBeGreaterThanOrEqual(8);
  });

  test('toggles the sidebar, keeps the toggle in place and survives a reload', async ({
    page,
  }) => {
    await page.goto('/');
    const before = await toggleOffset(page, 'Collapse sidebar');

    await page.getByRole('button', { name: 'Collapse sidebar' }).click();
    await expect(
      page.getByRole('button', { name: 'Expand sidebar' }),
    ).toBeVisible();
    await expect
      .poll(() => toggleOffset(page, 'Expand sidebar'))
      .toEqual(before);
    expect(
      await page.evaluate((key) => localStorage.getItem(key), EXPANDED_KEY),
    ).toBe('false');

    await page.reload();
    await expect(
      page.getByRole('button', { name: 'Expand sidebar' }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Expand sidebar' }).click();
    await expect(
      page.getByRole('button', { name: 'Collapse sidebar' }),
    ).toBeVisible();
    await expect
      .poll(() => toggleOffset(page, 'Collapse sidebar'))
      .toEqual(before);
  });

  test('reports favourite and more actions as disabled and does nothing on click', async ({
    page,
  }) => {
    await page.goto('/');
    const url = page.url();
    const favourite = page.getByRole('button', { name: 'Add to favourites' });
    const more = page.getByRole('button', { name: 'More actions' });

    await expect(favourite).toHaveAttribute('aria-disabled', 'true');
    await expect(more).toHaveAttribute('aria-disabled', 'true');

    await favourite.click({ force: true });
    await more.click({ force: true });
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(page.url()).toBe(url);
  });
});
