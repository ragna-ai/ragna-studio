import { expect, test } from '@playwright/test';

const AGENT_NAME = 'E2E Assistant';
const SCRIPTED_REPLY = 'scripted model output';

test('creates an agent and chats with it', async ({ page }) => {
  await page.goto('/agent/create');
  await page.getByLabel('Name').fill(AGENT_NAME);
  await page.getByRole('tab', { name: 'Model' }).click();
  await page.getByRole('combobox').click();
  await page.getByRole('option', { name: /E2E Model/ }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page).toHaveURL(/\/agent$/);

  await page.goto('/chat');
  await expect(
    page.getByRole('combobox').filter({ hasText: AGENT_NAME }),
  ).toBeVisible();
  await page.getByPlaceholder('Ask E2E Assistant').fill('Hello');
  await page.getByRole('button', { name: 'Submit' }).click();

  await expect(page.getByText(SCRIPTED_REPLY, { exact: true })).toBeVisible();
});

test('a failed save opens the first section with an error and focuses it', async ({
  page,
}) => {
  await page.goto('/agent/create');
  await page.getByLabel('Name').fill('ab');
  await page.getByRole('tab', { name: 'Tools' }).click();
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByRole('tab', { name: 'Persona' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByLabel('Name')).toBeFocused();
  await expect(
    page.getByText('Name must be at least 4 characters.'),
  ).toBeVisible();
});
