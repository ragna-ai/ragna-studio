import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { STORAGE_STATE_PATH } from '../playwright.config';

const API_URL = 'http://localhost:3110';

const storageStateSchema = z.object({
  origins: z.array(
    z.object({
      localStorage: z.array(z.object({ name: z.string(), value: z.string() })),
    }),
  ),
});

const folderResponseSchema = z.object({ folder: z.object({ id: z.string() }) });
const documentResponseSchema = z.object({
  document: z.object({ id: z.string() }),
});

function readWorkspaceId(): string {
  const state = storageStateSchema.parse(
    JSON.parse(readFileSync(STORAGE_STATE_PATH, 'utf8')),
  );
  const entry = state.origins
    .flatMap((origin) => origin.localStorage)
    .find((item) => item.name === 'workspace-scope');
  if (!entry) {
    throw new Error('workspace-scope missing in storage state');
  }
  return entry.value;
}

function workspaceUrl(path: string): string {
  return `${API_URL}/workspace/${readWorkspaceId()}${path}`;
}

function uniqueName(prefix: string): string {
  return `${prefix} ${crypto.randomUUID().slice(0, 8)}`;
}

async function seedFolder(
  request: APIRequestContext,
  name: string,
): Promise<string> {
  const response = await request.post(workspaceUrl('/folder'), {
    data: { name },
  });
  expect(response.ok()).toBe(true);
  return folderResponseSchema.parse(await response.json()).folder.id;
}

async function seedDocument(
  request: APIRequestContext,
  title: string,
  folderId: string | null,
): Promise<string> {
  const response = await request.post(workspaceUrl('/document'), {
    data: { title, folderId },
  });
  expect(response.ok()).toBe(true);
  return documentResponseSchema.parse(await response.json()).document.id;
}

function breadcrumb(page: Page) {
  return page.getByRole('navigation', { name: 'breadcrumb' });
}

async function openActions(page: Page) {
  await page.getByRole('button', { name: 'More actions' }).click();
}

test('shows the folder in the breadcrumb and links to it', async ({
  page,
  request,
}) => {
  const folderName = uniqueName('Folder');
  const title = uniqueName('Filed');
  const folderId = await seedFolder(request, folderName);
  const documentId = await seedDocument(request, title, folderId);

  await page.goto(`/document/${documentId}`);

  await expect(breadcrumb(page)).toContainText(title);
  await breadcrumb(page).getByRole('link', { name: folderName }).click();
  await expect(page).toHaveURL(new RegExp(`/document\\?folder=${folderId}`));
});

test('shows no folder crumb for an unfiled document', async ({
  page,
  request,
}) => {
  const title = uniqueName('Unfiled');
  const documentId = await seedDocument(request, title, null);

  await page.goto(`/document/${documentId}`);

  await expect(breadcrumb(page)).toContainText(title);
  await expect(
    breadcrumb(page).getByRole('link', { disabled: false }),
  ).toHaveCount(1);
});

test('renames the document from the actions menu', async ({
  page,
  request,
}) => {
  const title = uniqueName('Before');
  const newTitle = uniqueName('After');
  const documentId = await seedDocument(request, title, null);
  await page.goto(`/document/${documentId}`);

  await openActions(page);
  await page.getByRole('menuitem', { name: 'Rename…' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill(newTitle);
  await dialog.getByRole('button', { name: 'Save' }).click();

  await expect(breadcrumb(page)).toContainText(newTitle);
  await expect(breadcrumb(page)).not.toContainText(title);
});

test('moves the document into a folder from the actions menu', async ({
  page,
  request,
}) => {
  const folderName = uniqueName('Target');
  const title = uniqueName('Moving');
  await seedFolder(request, folderName);
  const documentId = await seedDocument(request, title, null);
  await page.goto(`/document/${documentId}`);

  await openActions(page);
  await page.getByRole('menuitem', { name: 'Move to folder' }).click();
  await page.getByRole('menuitem', { name: folderName }).click();

  await expect(
    breadcrumb(page).getByRole('link', { name: folderName }),
  ).toBeVisible();
});

test('deletes the document from the actions menu', async ({
  page,
  request,
}) => {
  const title = uniqueName('Doomed');
  const documentId = await seedDocument(request, title, null);
  await page.goto(`/document/${documentId}`);

  await openActions(page);
  await page.getByRole('menuitem', { name: 'Delete document' }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Delete' })
    .click();

  await expect(page).toHaveURL(/\/document$/);
  await expect(page.getByText(title)).toHaveCount(0);
});
