// packages/testing/src/cloud-drive/vendors/drive.fixture.ts
//
// The drive every vendor fake serves, in vendor-neutral terms. Each vendor's routes encode it
// in that vendor's wire format, so the cloud drive contract suite asserts one parsed result.

export interface DriveFixtureFile {
  id: string;
  name: string;
  mimeType: string;
  parentId: string | null;
  modifiedAt: Date;
  webUrl: string;
  /** Lives in a shared drive: invisible unless the request opts into shared drives. */
  shared: boolean;
  /** Reported size. Native Google files have none. */
  sizeBytes: number | null;
  /** What a download returns. */
  bytes: Buffer | null;
  /** What an export returns, for native Google files. */
  exportText: string | null;
  /** The connection may read the file but the vendor refuses writes to it. */
  readOnly: boolean;
}

export const DRIVE_FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';
export const DRIVE_DOC_MIME_TYPE = 'application/vnd.google-apps.document';
export const DRIVE_SHEET_MIME_TYPE = 'application/vnd.google-apps.spreadsheet';
export const DRIVE_SLIDES_MIME_TYPE = 'application/vnd.google-apps.presentation';
export const DRIVE_FORM_MIME_TYPE = 'application/vnd.google-apps.form';

/** The fake lists this many items per page. The cursor is `page-<offset>`. */
export const DRIVE_PAGE_SIZE = 2;

function buildTinyPdf(text: string): Buffer {
  const content = `BT /F1 18 Tf 20 100 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

export const DRIVE_PDF_TEXT = 'Quarterly figures for the board';

const PNG_1X1_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function driveFile(
  file: Partial<DriveFixtureFile> & Pick<DriveFixtureFile, 'id' | 'name' | 'mimeType'>,
) {
  const fixture: DriveFixtureFile = {
    parentId: null,
    modifiedAt: new Date('2026-10-12T09:30:00.000Z'),
    webUrl: `https://drive.google.com/file/d/${file.id}/view`,
    shared: false,
    sizeBytes: null,
    bytes: null,
    exportText: null,
    readOnly: false,
    ...file,
  };
  return fixture;
}

export const DRIVE_FOLDER = driveFile({
  id: '1fAkEfOlDeR0aB3cD4eF5gH6iJ7kL8mN9',
  name: 'Board reports',
  mimeType: DRIVE_FOLDER_MIME_TYPE,
  webUrl: 'https://drive.google.com/drive/folders/1fAkEfOlDeR0aB3cD4eF5gH6iJ7kL8mN9',
});

export const DRIVE_DOC = driveFile({
  id: '1dOcFaKe0qWeRtYuIoPaSdFgHjKlZxCvB',
  name: 'Quarterly plan',
  mimeType: DRIVE_DOC_MIME_TYPE,
  webUrl: 'https://docs.google.com/document/d/1dOcFaKe0qWeRtYuIoPaSdFgHjKlZxCvB/edit',
  exportText: '# Quarterly plan\n\nShip the **cloud drive** connector.\n',
});

export const DRIVE_SHEET = driveFile({
  id: '1sHeEtFaKe0aSdFgHjKlQwErTyUiOpZxC',
  name: 'Budget 2026',
  mimeType: DRIVE_SHEET_MIME_TYPE,
  webUrl: 'https://docs.google.com/spreadsheets/d/1sHeEtFaKe0aSdFgHjKlQwErTyUiOpZxC/edit',
  exportText: 'Team,Budget\nPlatform,120000\nGrowth,80000\n',
});

export const DRIVE_SLIDES = driveFile({
  id: '1sLiDeSfAkE0zXcVbNmQwErTyUiOpAsDf',
  name: 'Kickoff deck',
  mimeType: DRIVE_SLIDES_MIME_TYPE,
  webUrl: 'https://docs.google.com/presentation/d/1sLiDeSfAkE0zXcVbNmQwErTyUiOpAsDf/edit',
  exportText: 'Kickoff\nGoals for the quarter\n',
});

export const DRIVE_PDF_BYTES = buildTinyPdf(DRIVE_PDF_TEXT);

export const DRIVE_PDF = driveFile({
  id: '1pDfFaKe0mNbVcXzLkJhGfDsAqWeRtYuI',
  name: 'board-figures.pdf',
  mimeType: 'application/pdf',
  parentId: DRIVE_FOLDER.id,
  sizeBytes: DRIVE_PDF_BYTES.byteLength,
  bytes: DRIVE_PDF_BYTES,
});

const DRIVE_IMAGE_BYTES = Buffer.from(PNG_1X1_BASE64, 'base64');

export const DRIVE_IMAGE = driveFile({
  id: '1iMgFaKe0pOiUyTrEwQaSdFgHjKlZxCvB',
  name: 'logo.png',
  mimeType: 'image/png',
  parentId: DRIVE_FOLDER.id,
  sizeBytes: DRIVE_IMAGE_BYTES.byteLength,
  bytes: DRIVE_IMAGE_BYTES,
});

const DRIVE_SHARED_FILE_BYTES = Buffer.from('Shared drive notes: launch on Friday.\n', 'utf-8');

export const DRIVE_SHARED_FILE = driveFile({
  id: '1sHaReDfAkE0lKjHgFdSaPoIuYtReWqAz',
  name: 'Team notes.txt',
  mimeType: 'text/plain',
  parentId: DRIVE_FOLDER.id,
  shared: true,
  sizeBytes: DRIVE_SHARED_FILE_BYTES.byteLength,
  bytes: DRIVE_SHARED_FILE_BYTES,
});

/** A native type the adapter does not export. */
export const DRIVE_FORM = driveFile({
  id: '1fOrMfAkE0aSdFgHjKlQwErTyUiOpZxCvB',
  name: 'Feedback form',
  mimeType: DRIVE_FORM_MIME_TYPE,
});

/** Reports a size no tool should download. */
export const DRIVE_LARGE_FILE = driveFile({
  id: '1lArGeFaKe0qAzWsXeDcRfVtGbYhNuJmI',
  name: 'archive.zip',
  mimeType: 'application/zip',
  sizeBytes: 250 * 1024 * 1024,
});

const DRIVE_NOTES_BYTES = Buffer.from('Meeting notes\n', 'utf-8');

/** A plain text file the connection may update. */
export const DRIVE_NOTES = driveFile({
  id: '1nOtEsFaKe0qWeAsZxCdRfVbGtYhNuJmK',
  name: 'notes.txt',
  mimeType: 'text/plain',
  sizeBytes: DRIVE_NOTES_BYTES.byteLength,
  bytes: DRIVE_NOTES_BYTES,
});

const DRIVE_READ_ONLY_BYTES = Buffer.from('Policy text\n', 'utf-8');

/** A text file the connection can read but not change. */
export const DRIVE_READ_ONLY_FILE = driveFile({
  id: '1rEaDoNlYfAkE0qWeAsZxCdRfVbGtYhNu',
  name: 'policy.txt',
  mimeType: 'text/plain',
  sizeBytes: DRIVE_READ_ONLY_BYTES.byteLength,
  bytes: DRIVE_READ_ONLY_BYTES,
  readOnly: true,
});

/** The id the fake gives every file it creates. */
export const DRIVE_CREATED_FILE_ID = '1cReAtEdFaKe0qWeRtYuIoPaSdFgHjKlZ';

export const DRIVE_MISSING_ID = '1mIsSiNgFaKe0doesNotExistAnywhere00';

/** Every file the fake knows. Root holds the first four, the folder holds the next three. */
export const DRIVE_FILES: readonly DriveFixtureFile[] = [
  DRIVE_FOLDER,
  DRIVE_DOC,
  DRIVE_SHEET,
  DRIVE_SLIDES,
  DRIVE_PDF,
  DRIVE_IMAGE,
  DRIVE_SHARED_FILE,
  DRIVE_FORM,
  DRIVE_LARGE_FILE,
  DRIVE_NOTES,
  DRIVE_READ_ONLY_FILE,
];

export const DRIVE_ROOT_CHILDREN: readonly DriveFixtureFile[] = [
  DRIVE_FOLDER,
  DRIVE_DOC,
  DRIVE_SHEET,
  DRIVE_SLIDES,
];

export const DRIVE_SEARCH_QUERY = "quarterly o'brien \\ plan";

/** What the fake answers a search with. */
export const DRIVE_SEARCH_RESULTS: readonly DriveFixtureFile[] = [DRIVE_DOC, DRIVE_SHARED_FILE];
