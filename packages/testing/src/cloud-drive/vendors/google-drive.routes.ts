// packages/testing/src/cloud-drive/vendors/google-drive.routes.ts
//
// Google Drive v3 answers for the shared test drive. Payloads follow files.list / files.get /
// files.export, ids and people replaced. Every route matches under /drive/v3 so other
// googleapis.com paths still fall through to "no route" and throw.
import {
  vendorJson,
  vendorRoute,
  type VendorEndpoint,
  type VendorRequest,
  type VendorRoute,
} from '../../vendor-http/vendor-route';
import {
  DRIVE_CREATED_FILE_ID,
  DRIVE_FILES,
  DRIVE_PAGE_SIZE,
  DRIVE_ROOT_CHILDREN,
  DRIVE_SEARCH_RESULTS,
  type DriveFixtureFile,
} from './drive.fixture';

const HOST = 'www.googleapis.com';
const BASE = '/drive/v3';
const UPLOAD_BASE = '/upload/drive/v3';
const CURSOR_PREFIX = 'page-';

export const GOOGLE_DRIVE_ENDPOINTS = {
  list: { method: 'GET', host: HOST, path: new RegExp(`^${BASE}/files$`) },
  file: { method: 'GET', host: HOST, path: new RegExp(`^${BASE}/files/([^/]+)$`) },
  export: { method: 'GET', host: HOST, path: new RegExp(`^${BASE}/files/([^/]+)/export$`) },
  create: { method: 'POST', host: HOST, path: new RegExp(`^${UPLOAD_BASE}/files$`) },
  update: { method: 'PATCH', host: HOST, path: new RegExp(`^${UPLOAD_BASE}/files/([^/]+)$`) },
} satisfies Record<string, VendorEndpoint>;

export const GOOGLE_DRIVE_NOT_FOUND_BODY = {
  error: {
    code: 404,
    message: 'File not found: 1mIsSiNgFaKe0doesNotExistAnywhere00.',
    errors: [
      { message: 'File not found.', domain: 'global', reason: 'notFound', location: 'fileId' },
    ],
    status: 'NOT_FOUND',
  },
};

export const GOOGLE_DRIVE_RATE_LIMIT_BODY = {
  error: {
    code: 403,
    message: 'User rate limit exceeded.',
    errors: [
      {
        message: 'User rate limit exceeded.',
        domain: 'usageLimits',
        reason: 'userRateLimitExceeded',
      },
    ],
    status: 'RESOURCE_EXHAUSTED',
  },
};

export const GOOGLE_DRIVE_READ_ONLY_BODY = {
  error: {
    code: 403,
    message: 'The user does not have sufficient permissions for this file.',
    errors: [
      {
        message: 'Insufficient permissions.',
        domain: 'global',
        reason: 'insufficientFilePermissions',
      },
    ],
    status: 'PERMISSION_DENIED',
  },
};

function toFileResource(file: DriveFixtureFile) {
  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    modifiedTime: file.modifiedAt.toISOString(),
    webViewLink: file.webUrl,
    ...(file.sizeBytes === null ? {} : { size: String(file.sizeBytes) }),
  };
}

function notFound(): Response {
  return vendorJson(GOOGLE_DRIVE_NOT_FOUND_BODY, { status: 404 });
}

function optsIntoSharedDrives(request: VendorRequest): boolean {
  return request.url.searchParams.get('supportsAllDrives') === 'true';
}

function findVisibleFile(request: VendorRequest, id: string | undefined): DriveFixtureFile | null {
  const file = DRIVE_FILES.find((candidate) => candidate.id === id);
  if (!file) return null;
  return file.shared && !optsIntoSharedDrives(request) ? null : file;
}

function readOffset(cursor: string | null): number {
  const offset = Number(cursor?.slice(CURSOR_PREFIX.length));
  return Number.isInteger(offset) && offset > 0 ? offset : 0;
}

function pageOf(request: VendorRequest, files: readonly DriveFixtureFile[]): Response {
  const visible = files.filter((file) => !file.shared || optsIntoSharedDrives(request));
  const offset = readOffset(request.url.searchParams.get('pageToken'));
  const page = visible.slice(offset, offset + DRIVE_PAGE_SIZE);
  const next = offset + DRIVE_PAGE_SIZE;
  return vendorJson({
    kind: 'drive#fileList',
    incompleteSearch: false,
    files: page.map(toFileResource),
    ...(next < visible.length ? { nextPageToken: `${CURSOR_PREFIX}${next}` } : {}),
  });
}

function childrenOf(parentId: string): readonly DriveFixtureFile[] {
  if (parentId === 'root') return DRIVE_ROOT_CHILDREN;
  return DRIVE_FILES.filter((file) => file.parentId === parentId);
}

function answerList(request: VendorRequest): Response {
  const q = request.url.searchParams.get('q') ?? '';
  const parent = q.match(/^'((?:[^'\\]|\\.)*)' in parents/);
  if (parent?.[1]) return pageOf(request, childrenOf(parent[1]));
  return pageOf(request, DRIVE_SEARCH_RESULTS);
}

function answerFile(request: VendorRequest, match: RegExpMatchArray): Response {
  const file = findVisibleFile(request, match[1]);
  if (!file) return notFound();
  if (request.url.searchParams.get('alt') !== 'media') return vendorJson(toFileResource(file));
  if (!file.bytes) return vendorJson(GOOGLE_DRIVE_READ_ONLY_BODY, { status: 403 });
  return new Response(file.bytes, { headers: { 'content-type': file.mimeType } });
}

function answerExport(request: VendorRequest, match: RegExpMatchArray): Response {
  const file = findVisibleFile(request, match[1]);
  if (!file) return notFound();
  if (file.exportText === null) return vendorJson(GOOGLE_DRIVE_READ_ONLY_BODY, { status: 403 });
  const mimeType = request.url.searchParams.get('mimeType') ?? 'text/plain';
  return new Response(file.exportText, { headers: { 'content-type': mimeType } });
}

const UPLOAD_METADATA_PATTERN = /^\{.*\}$/m;

function readUploadMetadata(body: string | null): { name: string; mimeType: string } {
  const json = body?.match(UPLOAD_METADATA_PATTERN)?.[0] ?? '{}';
  const parsed: { name?: string; mimeType?: string } = JSON.parse(json);
  return { name: parsed.name ?? 'untitled', mimeType: parsed.mimeType ?? 'text/plain' };
}

function answerCreate(request: VendorRequest): Response {
  const { name, mimeType } = readUploadMetadata(request.body);
  return vendorJson({
    id: DRIVE_CREATED_FILE_ID,
    name,
    mimeType,
    modifiedTime: new Date('2026-11-04T10:00:00.000Z').toISOString(),
    webViewLink: `https://drive.google.com/file/d/${DRIVE_CREATED_FILE_ID}/view`,
  });
}

function answerUpdate(request: VendorRequest, match: RegExpMatchArray): Response {
  const file = findVisibleFile(request, match[1]);
  if (!file) return notFound();
  if (file.readOnly) return vendorJson(GOOGLE_DRIVE_READ_ONLY_BODY, { status: 403 });
  return vendorJson(toFileResource(file));
}

export const GOOGLE_DRIVE_ROUTES: readonly VendorRoute[] = [
  vendorRoute(GOOGLE_DRIVE_ENDPOINTS.list, answerList),
  vendorRoute(GOOGLE_DRIVE_ENDPOINTS.export, answerExport),
  vendorRoute(GOOGLE_DRIVE_ENDPOINTS.file, answerFile),
  vendorRoute(GOOGLE_DRIVE_ENDPOINTS.create, answerCreate),
  vendorRoute(GOOGLE_DRIVE_ENDPOINTS.update, answerUpdate),
];
