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
  document: z.object({ id: z.string(), folderId: z.string().nullable() }),
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
) {
  const response = await request.post(workspaceUrl('/document'), {
    data: { title, folderId },
  });
  expect(response.ok()).toBe(true);
}

async function fetchDocument(request: APIRequestContext, documentId: string) {
  const response = await request.get(workspaceUrl(`/document/${documentId}`));
  expect(response.ok()).toBe(true);
  return documentResponseSchema.parse(await response.json()).document;
}

const documentListSchema = z.object({
  documents: z.array(z.object({ id: z.string() })),
});
const folderListSchema = z.object({
  folders: z.array(z.object({ id: z.string() })),
});

async function clearWorkspace(request: APIRequestContext) {
  const documentsResponse = await request.get(workspaceUrl('/document'));
  expect(documentsResponse.ok()).toBe(true);
  const { documents } = documentListSchema.parse(
    await documentsResponse.json(),
  );
  for (const document of documents) {
    const response = await request.delete(
      workspaceUrl(`/document/${document.id}`),
    );
    expect(response.ok()).toBe(true);
  }

  const foldersResponse = await request.get(workspaceUrl('/folder'));
  expect(foldersResponse.ok()).toBe(true);
  const { folders } = folderListSchema.parse(await foldersResponse.json());
  for (const folder of folders) {
    const response = await request.delete(workspaceUrl(`/folder/${folder.id}`));
    expect(response.ok()).toBe(true);
  }
}

function documentIdFromUrl(page: Page): string {
  const id = new URL(page.url()).pathname.split('/').pop();
  if (!id) {
    throw new Error('document id missing in URL');
  }
  return id;
}

async function createDocumentFromDialog(page: Page, title: string) {
  await page.getByRole('button', { name: 'New document' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Title').fill(title);
  await dialog.getByRole('button', { name: 'Create' }).click();
  await expect(page).toHaveURL(/\/document\/[^/?]+$/);
}

test('offers to create a document or a folder in an empty workspace', async ({
  page,
  request,
}) => {
  await clearWorkspace(request);
  await page.goto('/document');

  await expect(page.getByText('No documents or folders yet.')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'New document' }).last(),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'New folder' }).last(),
  ).toBeVisible();
});

test('opens a folder, goes back through breadcrumb and browser, and keeps the link', async ({
  page,
  request,
}) => {
  const folderName = uniqueName('Folder');
  const inFolderTitle = uniqueName('Filed');
  const unfiledTitle = uniqueName('Unfiled');
  const folderId = await seedFolder(request, folderName);
  await seedDocument(request, inFolderTitle, folderId);
  await seedDocument(request, unfiledTitle, null);

  await page.goto('/document');
  await expect(page.getByText(unfiledTitle)).toBeVisible();
  await expect(page.getByText(inFolderTitle)).toHaveCount(0);

  await page.getByText(folderName, { exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`folder=${folderId}`));
  await expect(page.getByText(inFolderTitle)).toBeVisible();
  await expect(page.getByText(unfiledTitle)).toHaveCount(0);
  await expect(
    page.getByRole('navigation', { name: 'breadcrumb' }),
  ).toContainText(folderName);

  await page.reload();
  await expect(page.getByText(inFolderTitle)).toBeVisible();

  await page.goBack();
  await expect(page.getByText(unfiledTitle)).toBeVisible();

  await page.goForward();
  await expect(page.getByText(inFolderTitle)).toBeVisible();
  await page
    .getByRole('navigation', { name: 'breadcrumb' })
    .getByRole('link', { name: 'Documents' })
    .click();
  await expect(page.getByText(unfiledTitle)).toBeVisible();
  await expect(page.getByText(inFolderTitle)).toHaveCount(0);
});

test('offers to create a document in an empty folder', async ({
  page,
  request,
}) => {
  const folderId = await seedFolder(request, uniqueName('Empty'));

  await page.goto(`/document?folder=${folderId}`);

  await expect(page.getByText('This folder is empty.')).toBeVisible();
  await expect(
    page.getByRole('main').getByRole('button', { name: 'New document' }).last(),
  ).toBeVisible();
});

test('files a new document in the open folder', async ({ page, request }) => {
  const folderName = uniqueName('Target');
  const folderId = await seedFolder(request, folderName);
  await page.goto(`/document?folder=${folderId}`);

  await createDocumentFromDialog(page, uniqueName('Created inside'));

  const created = await fetchDocument(request, documentIdFromUrl(page));
  expect(created.folderId).toBe(folderId);
});

test('creates a document in no folder from the top level', async ({
  page,
  request,
}) => {
  await page.goto('/document');

  await createDocumentFromDialog(page, uniqueName('Created at top'));

  const created = await fetchDocument(request, documentIdFromUrl(page));
  expect(created.folderId).toBeNull();
});
