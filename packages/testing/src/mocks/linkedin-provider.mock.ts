// packages/testing/src/mocks/linkedin-provider.mock.ts
//
// Mocks `@repo/linkedin` at the package boundary:
// it's a thin wrapper around LinkedIn's real REST
// API with no business logic of its own worth preserving in tests, and
// apps/api imports it directly, so mocking the whole package (rather than
// some npm dependency underneath it, like the `ai` mock does) is the right
// boundary here.
//
// Lives alongside the other provider mocks in @repo/testing for
// consistency, even though only apps/api uses LinkedIn today.
//
// `LinkedinApiError` is spread through from the real module so
// `error instanceof LinkedinApiError` checks in apps/api's
// social-post-media.service.ts still work against errors thrown by the
// fakes below.
import { mock } from 'bun:test';
import * as linkedinPackage from '@repo/linkedin';
import type {
  CreatePostInput,
  CreatePostResult,
  InitializeImageUploadInput,
  InitializeImageUploadResult,
  UploadImageBinaryInput,
  WaitForImageAvailableInput,
} from '@repo/linkedin';

function defaultCreatePostImpl({ imageUrns = [] }: CreatePostInput): Promise<CreatePostResult> {
  const urn = `urn:li:share:test-${crypto.randomUUID()}`;
  void imageUrns;
  return Promise.resolve({ urn, url: `https://www.linkedin.com/feed/update/${urn}` });
}

function defaultInitializeImageUploadImpl(
  _params: InitializeImageUploadInput,
): Promise<InitializeImageUploadResult> {
  return Promise.resolve({
    uploadUrl: `https://fake-linkedin-upload.test/${crypto.randomUUID()}`,
    imageUrn: `urn:li:image:test-${crypto.randomUUID()}`,
  });
}

function defaultUploadImageBinaryImpl(_params: UploadImageBinaryInput): Promise<void> {
  return Promise.resolve();
}

function defaultWaitForImageAvailableImpl(_params: WaitForImageAvailableInput): Promise<void> {
  return Promise.resolve();
}

export const createPostMock = mock(defaultCreatePostImpl);
export const initializeImageUploadMock = mock(defaultInitializeImageUploadImpl);
export const uploadImageBinaryMock = mock(defaultUploadImageBinaryImpl);
export const waitForImageAvailableMock = mock(defaultWaitForImageAvailableImpl);

const fakeLinkedinClient = {
  createPost: createPostMock,
  initializeImageUpload: initializeImageUploadMock,
  uploadImageBinary: uploadImageBinaryMock,
  waitForImageAvailable: waitForImageAvailableMock,
};

export const createLinkedinClientMock = mock(() => fakeLinkedinClient);

export function resetLinkedinProviderMock(): void {
  createLinkedinClientMock.mockClear();
  createPostMock.mockClear();
  createPostMock.mockImplementation(defaultCreatePostImpl);
  initializeImageUploadMock.mockClear();
  initializeImageUploadMock.mockImplementation(defaultInitializeImageUploadImpl);
  uploadImageBinaryMock.mockClear();
  uploadImageBinaryMock.mockImplementation(defaultUploadImageBinaryImpl);
  waitForImageAvailableMock.mockClear();
  waitForImageAvailableMock.mockImplementation(defaultWaitForImageAvailableImpl);
}

// Exported so apps/api's test preload can re-register it from the app's
// own resolution context. Under injectWorkspacePackages, this file runs
// from a frozen copy in node_modules/.pnpm/, where '@repo/linkedin'
// resolves to a different path than the one apps/api imports, so the
// mock.module call below never reaches the app on its own. Sharing one
// module object keeps LinkedinApiError identity consistent across both
// registrations. See specs/docker-deploy/injected-workspace-packages.md.
export const linkedinModuleMock = {
  ...linkedinPackage,
  createLinkedinClient: createLinkedinClientMock,
};

mock.module('@repo/linkedin', () => linkedinModuleMock);
