import {
  expect,
  test,
  type APIRequestContext,
  type Locator,
  type Page,
} from '@playwright/test';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { STORAGE_STATE_PATH } from '../playwright.config';

const API_URL = 'http://localhost:3110';

type ColumnType = 'text' | 'number' | 'date' | 'select';
type CellValue = string | number | null;

interface SeedColumn {
  name: string;
  type: ColumnType;
  options?: string[];
}

interface SeedDatasetInput {
  columns: SeedColumn[];
  rows: Record<string, CellValue>[];
}

interface SeededDataset {
  id: string;
  name: string;
  columnIds: Record<string, string>;
  rowIds: string[];
}

const storageStateSchema = z.object({
  origins: z.array(
    z.object({
      localStorage: z.array(z.object({ name: z.string(), value: z.string() })),
    }),
  ),
});

const idResponseSchema = z.object({
  dataset: z.object({ id: z.string() }).optional(),
  row: z.object({ id: z.string() }).optional(),
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

function datasetUrl(path = ''): string {
  return `${API_URL}/workspace/${readWorkspaceId()}/dataset${path}`;
}

async function postForId(
  request: APIRequestContext,
  url: string,
  data: object,
): Promise<z.infer<typeof idResponseSchema>> {
  const response = await request.post(url, { data });
  expect(response.ok()).toBe(true);
  return idResponseSchema.parse(await response.json());
}

async function seedDataset(
  request: APIRequestContext,
  input: SeedDatasetInput,
): Promise<SeededDataset> {
  const name = `Sheet ${crypto.randomUUID().slice(0, 8)}`;
  const columnIds: Record<string, string> = {};
  const columns = input.columns.map((column) => {
    const id = crypto.randomUUID();
    columnIds[column.name] = id;
    return {
      id,
      name: column.name,
      type: column.type,
      options: column.options,
    };
  });
  const created = await postForId(request, datasetUrl(), { name, columns });
  const id = created.dataset?.id ?? '';

  const rowIds: string[] = [];
  for (const row of input.rows) {
    const data: Record<string, CellValue> = {};
    for (const [columnName, value] of Object.entries(row)) {
      data[columnIds[columnName] ?? columnName] = value;
    }
    const createdRow = await postForId(request, datasetUrl(`/${id}/row`), {
      data,
    });
    rowIds.push(createdRow.row?.id ?? '');
  }
  return { id, name, columnIds, rowIds };
}

async function openDataset(page: Page, dataset: SeededDataset) {
  await page.goto(`/dataset/${dataset.id}`);
  await expect(page.getByRole('grid')).toBeVisible();
}

function dataRows(page: Page): Locator {
  return page.getByRole('row').filter({ has: page.getByRole('rowheader') });
}

function cellAt(page: Page, rowIndex: number, columnIndex: number): Locator {
  return dataRows(page).nth(rowIndex).getByRole('gridcell').nth(columnIndex);
}

async function columnTexts(page: Page, columnIndex: number): Promise<string[]> {
  return dataRows(page).evaluateAll(
    (rows, index) =>
      rows.map(
        (row) =>
          row
            .querySelectorAll('[role="gridcell"]')
            [index]?.textContent?.trim() ?? '',
      ),
    columnIndex,
  );
}

async function expectColumnTexts(
  page: Page,
  columnIndex: number,
  expected: string[],
) {
  await expect.poll(() => columnTexts(page, columnIndex)).toEqual(expected);
}

async function openRowMenu(page: Page, rowIndex: number) {
  const row = dataRows(page).nth(rowIndex);
  await row.hover();
  await row.getByRole('button', { name: 'Row actions' }).click();
}

async function pickOption(page: Page, trigger: Locator, option: string) {
  await trigger.click();
  await page.getByRole('option', { name: option, exact: true }).click();
  await expect(page.getByRole('listbox')).toHaveCount(0);
}

async function sortBy(page: Page, column: string, direction: string) {
  const popover = page.getByRole('dialog');
  await page.getByRole('button', { name: /^Sort/ }).click();
  await expect(popover).toBeVisible();
  await pickOption(page, popover.getByRole('combobox').first(), column);
  await pickOption(page, popover.getByRole('combobox').nth(1), direction);
  await closePopover(page);
}

interface FilterInput {
  column: string;
  op: string;
  value?: string;
  options?: string[];
}

async function openFilterPopover(page: Page): Promise<Locator> {
  const popover = page.getByRole('dialog');
  if (!(await popover.isVisible())) {
    await page.getByRole('button', { name: /^Filter/ }).click();
  }
  return popover;
}

async function addFilter(page: Page, filter: FilterInput) {
  const popover = await openFilterPopover(page);
  await popover.getByRole('button', { name: 'Add filter' }).click();
  const draftCount = (await popover.getByRole('combobox').count()) / 2;
  const first = (draftCount - 1) * 2;
  await pickOption(
    page,
    popover.getByRole('combobox').nth(first),
    filter.column,
  );
  await pickOption(
    page,
    popover.getByRole('combobox').nth(first + 1),
    filter.op,
  );
  if (filter.value !== undefined) {
    await popover.getByPlaceholder('Value').last().fill(filter.value);
  }
  for (const option of filter.options ?? []) {
    await popover.getByRole('checkbox', { name: option }).click();
  }
}

async function clearFilters(page: Page) {
  const popover = await openFilterPopover(page);
  await popover.getByRole('button', { name: 'Clear filters' }).click();
  await closePopover(page);
}

async function closePopover(page: Page) {
  await expect(async () => {
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 500 });
  }).toPass();
}

const PEOPLE_COLUMNS: SeedColumn[] = [
  { name: 'Name', type: 'text' },
  { name: 'Age', type: 'number' },
  { name: 'Born', type: 'date' },
  { name: 'Status', type: 'select', options: ['todo', 'done'] },
];

const PEOPLE_ROWS: Record<string, CellValue>[] = [
  { Name: 'Carol', Age: 30, Born: '2026-03-01', Status: 'done' },
  { Name: 'Alice', Age: 10, Born: '2026-01-01', Status: 'todo' },
  { Name: 'Bob', Age: 20, Born: '2026-02-01', Status: 'done' },
];

const NAME_COLUMN = 0;
const AGE_COLUMN = 1;
const STATUS_COLUMN = 3;

function seedPeople(request: APIRequestContext) {
  return seedDataset(request, { columns: PEOPLE_COLUMNS, rows: PEOPLE_ROWS });
}

test('US-1 reads a dataset at a glance', async ({ page, request }) => {
  const dataset = await seedPeople(request);
  await openDataset(page, dataset);

  await expect(dataRows(page).nth(0).getByRole('rowheader')).toContainText('1');
  await expect(cellAt(page, 0, NAME_COLUMN)).toHaveText('Carol');
  await expect(
    cellAt(page, 0, NAME_COLUMN).locator('input, button'),
  ).toHaveCount(0);
  await expect(
    cellAt(page, 0, STATUS_COLUMN).locator('span.rounded-md'),
  ).toHaveText('done');
  await expect(
    page.getByRole('columnheader', { name: 'Age' }).locator('svg').first(),
  ).toBeVisible();
  await expect(
    page.getByText(dataset.name, { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText('3 rows · 4 columns')).toBeVisible();

  const noColumns = await seedDataset(request, { columns: [], rows: [] });
  await page.goto(`/dataset/${noColumns.id}`);
  await expect(
    page.getByText('This dataset has no columns yet.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Add columns' }).click();
  await expect(page.getByText('Save columns')).toBeVisible();
});

test('US-2 moves between cells', async ({ page, request }) => {
  const dataset = await seedPeople(request);
  await openDataset(page, dataset);

  await cellAt(page, 0, 0).click();
  await expect(cellAt(page, 0, 0)).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('input, textarea')).toHaveCount(0);

  await page.keyboard.press('ArrowDown');
  await expect(cellAt(page, 1, 0)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowRight');
  await expect(cellAt(page, 1, 1)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Tab');
  await expect(cellAt(page, 1, 2)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Shift+Tab');
  await expect(cellAt(page, 1, 1)).toHaveAttribute('aria-selected', 'true');
});

test('US-3 edits a cell', async ({ page, request }) => {
  const dataset = await seedPeople(request);
  await openDataset(page, dataset);

  await cellAt(page, 0, NAME_COLUMN).click();
  await page.keyboard.press('Enter');
  await expect(cellAt(page, 0, NAME_COLUMN).getByRole('textbox')).toHaveValue(
    'Carol',
  );
  await page.keyboard.press('Escape');
  await expect(cellAt(page, 0, NAME_COLUMN)).toHaveText('Carol');

  await page.keyboard.type('Dave');
  await page.keyboard.press('Enter');
  await expect(cellAt(page, 0, NAME_COLUMN)).toHaveText('Dave');
  await page.reload();
  await expect(cellAt(page, 0, NAME_COLUMN)).toHaveText('Dave');

  await page.route('**/row/*', async (route) => {
    if (route.request().method() !== 'PATCH') {
      await route.continue();
      return;
    }
    await route.fulfill({ status: 422, json: { message: 'Rejected' } });
  });
  await cellAt(page, 1, NAME_COLUMN).click();
  await page.keyboard.type('Rejected');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-sonner-toast]')).toBeVisible();
  await expect(cellAt(page, 1, NAME_COLUMN)).toHaveText('Alice');
});

test('US-4 runs row actions', async ({ page, request }) => {
  const dataset = await seedPeople(request);
  await openDataset(page, dataset);

  await openRowMenu(page, 1);
  await page.getByRole('menuitem', { name: 'Move up' }).click();
  await expectColumnTexts(page, NAME_COLUMN, ['Alice', 'Carol', 'Bob']);

  const addRowButtons = page.getByRole('button', { name: 'Add row' });
  await page.getByRole('grid').getByRole('button', { name: 'Add row' }).click();
  await expect(dataRows(page)).toHaveCount(4);
  await page.keyboard.type('Zed');
  await page.keyboard.press('Enter');
  await expect(cellAt(page, 3, NAME_COLUMN)).toHaveText('Zed');
  await page.reload();
  await expect(cellAt(page, 3, NAME_COLUMN)).toHaveText('Zed');

  await addRowButtons.last().click();
  await expect(dataRows(page)).toHaveCount(5);
  await page.keyboard.press('Escape');

  await sortBy(page, 'Name', 'Ascending');
  await openRowMenu(page, 1);
  await expect(
    page.getByText('Clear sort and filters to move rows'),
  ).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Move up' })).toBeDisabled();
  await page.keyboard.press('Escape');

  const longDataset = await seedDataset(request, {
    columns: PEOPLE_COLUMNS,
    rows: Array.from({ length: 40 }, (_, index) => ({
      Name: `Person ${index + 1}`,
      Age: index + 1,
    })),
  });
  await openDataset(page, longDataset);

  await page.getByRole('button', { name: /^Display/ }).focus();
  await page.keyboard.press('Tab');
  await expect(cellAt(page, 0, 0)).toHaveAttribute('aria-selected', 'true');

  const grid = page.getByRole('grid');
  await grid.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  const addRowCells = grid
    .getByRole('button', { name: 'Add row' })
    .locator('xpath=../..')
    .locator('> div');
  await page.route('**/dataset/*/row', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.continue();
  });
  await addRowCells.nth(2).click();
  await page.keyboard.type('77');
  await page.keyboard.press('Enter');

  await expect(dataRows(page)).toHaveCount(41);
  await expect(cellAt(page, 40, AGE_COLUMN)).toHaveText('77');
  await expect(cellAt(page, 40, NAME_COLUMN)).toHaveText('');
  await expect(cellAt(page, 0, 0)).not.toHaveAttribute('aria-selected', 'true');
});

test('US-5 sorts and clears the sort', async ({ page, request }) => {
  const dataset = await seedPeople(request);
  await openDataset(page, dataset);

  await sortBy(page, 'Age', 'Ascending');
  await expectColumnTexts(page, AGE_COLUMN, ['10', '20', '30']);
  await expect(page.getByRole('columnheader', { name: 'Age' })).toHaveAttribute(
    'aria-sort',
    'ascending',
  );
  await sortBy(page, 'Age', 'Descending');
  await expectColumnTexts(page, AGE_COLUMN, ['30', '20', '10']);

  await page.getByRole('button', { name: /^Sort/ }).click();
  await page.getByRole('button', { name: 'Clear sort' }).click();
  await closePopover(page);
  await expectColumnTexts(page, NAME_COLUMN, ['Carol', 'Alice', 'Bob']);
});

test('US-6 filters rows', async ({ page, request }) => {
  const dataset = await seedPeople(request);
  await openDataset(page, dataset);

  await addFilter(page, { column: 'Name', op: 'contains', value: 'ali' });
  await expectColumnTexts(page, NAME_COLUMN, ['Alice']);
  await clearFilters(page);

  await addFilter(page, { column: 'Age', op: 'is greater than', value: '15' });
  await expectColumnTexts(page, NAME_COLUMN, ['Carol', 'Bob']);
  await expect(page.getByText('2 of 3 rows')).toBeVisible();
  await clearFilters(page);

  await addFilter(page, { column: 'Name', op: 'contains', value: 'zzz' });
  await closePopover(page);
  await expect(page.getByText('No rows match the filters.')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(dataRows(page)).toHaveCount(3);
});

test('US-7 hides columns and keeps the view after a reload', async ({
  page,
  request,
}) => {
  const dataset = await seedPeople(request);
  await openDataset(page, dataset);

  await page.getByRole('button', { name: /^Display/ }).click();
  await page.getByRole('switch', { name: 'Age' }).click();
  await closePopover(page);
  await expect(page.getByRole('columnheader', { name: 'Age' })).toHaveCount(0);
  const saved = await request.get(datasetUrl(`/${dataset.id}/row`));
  expect(await saved.text()).toContain('30');

  await sortBy(page, 'Name', 'Ascending');
  await page.reload();
  await expectColumnTexts(page, NAME_COLUMN, ['Alice', 'Bob', 'Carol']);
  await expect(page.getByRole('columnheader', { name: 'Age' })).toHaveCount(0);
});

test('US-8 follows a column type change and flags values that do not fit', async ({
  page,
  request,
}) => {
  const dataset = await seedDataset(request, {
    columns: [
      { name: 'Name', type: 'text' },
      { name: 'Value', type: 'text' },
    ],
    rows: [
      { Name: 'A', Value: '5' },
      { Name: 'B', Value: 'abc' },
    ],
  });
  await openDataset(page, dataset);

  await page.getByRole('button', { name: 'Columns' }).click();
  await pickOption(page, page.getByRole('combobox').nth(1), 'Number');
  await page.getByRole('button', { name: 'Save columns' }).click();
  await expect(page.getByRole('button', { name: 'Save columns' })).toHaveCount(
    0,
  );

  const mismatchLabel = "Doesn't match the column type";
  await expect(cellAt(page, 1, 1)).toContainText('abc');
  await expect(cellAt(page, 1, 1).getByLabel(mismatchLabel)).toBeVisible();
  await cellAt(page, 1, 1).locator('svg').hover();
  await expect(page.getByRole('tooltip')).toHaveText(mismatchLabel);
  await cellAt(page, 1, 1).dblclick();
  await expect(cellAt(page, 1, 1).locator('input[type=number]')).toBeVisible();
});

test('US-9 adds a column from the sheet', async ({ page, request }) => {
  const dataset = await seedPeople(request);
  await openDataset(page, dataset);

  await page.getByRole('button', { name: 'Add column' }).click();
  await page.getByRole('button', { name: 'Add column' }).last().click();
  await expect(page.getByText('Name is required')).toBeVisible();

  await page.getByPlaceholder('Column name').fill('Notes');
  await page.getByRole('button', { name: 'Add column' }).last().click();

  await expect(
    page.getByRole('columnheader', { name: /^Notes/ }),
  ).toBeVisible();
  await expect(page.getByText('3 rows · 5 columns')).toBeVisible();
});
