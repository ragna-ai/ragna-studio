import { expect, test } from '@playwright/test';

const AGENT_NAME = 'E2E Assistant';
const SCRIPTED_REPLY = 'scripted model output';

test('creates an agent and chats with it', async ({ page }) => {
  await page.goto('/agent/create');
  await page.getByLabel('Name').fill(AGENT_NAME);
  await page.getByRole('tab', { name: 'Intelligence' }).click();
  await page.getByRole('combobox').click();
  await page.getByRole('option', { name: /E2E Model/ }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page).toHaveURL(/\/agent$/);

  await page.goto('/chat');
  await expect(
    page.getByRole('combobox').filter({ hasText: AGENT_NAME }),
  ).toBeVisible();
  await page.getByPlaceholder('How can I help you?').fill('Hello');
  await page.getByRole('button', { name: 'Submit' }).click();

  await expect(page.getByText(SCRIPTED_REPLY, { exact: true })).toBeVisible();
});
