import { setTimeout as sleep } from 'node:timers/promises';

// LinkedIn's versioned REST API requires this header on every request.
// LinkedIn ships a new version every month, named by year and month (YYYYMM).
// Bump this constant when the API introduces breaking changes we need.
export const LINKEDIN_API_VERSION = '202506';

const LINKEDIN_API_BASE_URL = 'https://api.linkedin.com/rest';

// How often to poll an uploading image's status, and how long to wait by
// default before giving up. Publishing is synchronous in the request, so
// both numbers are kept small.
const IMAGE_POLL_INTERVAL_MS = 1500;
const DEFAULT_IMAGE_WAIT_TIMEOUT_MS = 30_000;

const REQUEST_TIMEOUT_MS = 30_000;
// Binary uploads are larger and slower than the JSON endpoints above.
const UPLOAD_TIMEOUT_MS = 120_000;

export interface CreatePostImageInput {
  /** e.g. `urn:li:image:C123...`, as returned by `initializeImageUpload`. */
  urn: string;
  altText?: string;
}

export interface CreatePostInput {
  /** The LinkedIn person id (better-auth stores this as `account.accountId`). */
  authorId: string;
  text: string;
  /** 0 images makes a text post, 1 a single-image post, 2+ a multi-image post. */
  imageUrns?: CreatePostImageInput[];
}

export interface CreatePostResult {
  /** e.g. `urn:li:share:123456789` */
  urn: string;
  url: string;
}

export interface InitializeImageUploadInput {
  authorId: string;
}

export interface InitializeImageUploadResult {
  uploadUrl: string;
  /** e.g. `urn:li:image:C123...` */
  imageUrn: string;
}

export interface UploadImageBinaryInput {
  uploadUrl: string;
  data: Buffer | Uint8Array;
  mimeType: string;
}

export interface WaitForImageAvailableInput {
  imageUrn: string;
  timeoutMs?: number;
}

export class LinkedinApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: string,
  ) {
    super(message);
    this.name = 'LinkedinApiError';
  }

  /** Builds a LinkedinApiError from a failed fetch Response, reading its body for context. */
  static async fromResponse(
    response: Response,
    label = 'LinkedIn API error',
  ): Promise<LinkedinApiError> {
    const body = await response.text();
    return new LinkedinApiError(
      `${label}: ${response.status} ${response.statusText}`,
      response.status,
      body,
    );
  }
}

/**
 * Thin client for the LinkedIn versioned REST API (`/rest/*`). Covers
 * publishing text and image posts: initializing an image upload, uploading
 * the binary, waiting for LinkedIn to finish processing it, and creating the
 * post itself.
 */
export class LinkedinClient {
  constructor(private readonly accessToken: string) {}

  /**
   * Creates a post. With no images this is a text-only post. With one image
   * it uses `content.media`; with two or more it uses `content.multiImage`.
   * Each image must already be uploaded and `AVAILABLE` (see
   * `initializeImageUpload`, `uploadImageBinary`, `waitForImageAvailable`).
   */
  async createPost({ authorId, text, imageUrns = [] }: CreatePostInput): Promise<CreatePostResult> {
    const response = await fetch(`${LINKEDIN_API_BASE_URL}/posts`, {
      method: 'POST',
      headers: this.jsonHeaders(),
      body: JSON.stringify({
        author: `urn:li:person:${authorId}`,
        commentary: text,
        visibility: 'PUBLIC',
        distribution: {
          feedDistribution: 'MAIN_FEED',
          targetEntities: [],
          thirdPartyDistributionChannels: [],
        },
        lifecycleState: 'PUBLISHED',
        isReshareDisabledByAuthor: false,
        ...buildPostContent(imageUrns),
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw await LinkedinApiError.fromResponse(response);
    }

    // A successful create returns 201 with an empty body. The new post's URN
    // is only available in the `x-restli-id` response header.
    const urn = response.headers.get('x-restli-id');

    if (!urn) {
      throw new LinkedinApiError('LinkedIn did not return a post id', response.status);
    }

    return {
      urn,
      url: `https://www.linkedin.com/feed/update/${urn}`,
    };
  }

  /**
   * Registers an upcoming image upload for the given person. Returns a
   * one-time `uploadUrl` to PUT the binary to, and the image's URN.
   */
  async initializeImageUpload({
    authorId,
  }: InitializeImageUploadInput): Promise<InitializeImageUploadResult> {
    const response = await fetch(`${LINKEDIN_API_BASE_URL}/images?action=initializeUpload`, {
      method: 'POST',
      headers: this.jsonHeaders(),
      body: JSON.stringify({
        initializeUploadRequest: {
          owner: `urn:li:person:${authorId}`,
        },
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw await LinkedinApiError.fromResponse(response);
    }

    const body = (await response.json()) as { value: { uploadUrl: string; image: string } };

    return { uploadUrl: body.value.uploadUrl, imageUrn: body.value.image };
  }

  /**
   * Uploads the image bytes to the URL from `initializeImageUpload`. Unlike
   * the video upload flow, LinkedIn requires the bearer token here too.
   */
  async uploadImageBinary({ uploadUrl, data, mimeType }: UploadImageBinaryInput): Promise<void> {
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': mimeType,
      },
      body: data,
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw await LinkedinApiError.fromResponse(
        response,
        'Failed to upload image binary to LinkedIn',
      );
    }
  }

  /**
   * Polls an image's processing status until it becomes `AVAILABLE`. Throws
   * on `PROCESSING_FAILED` or once `timeoutMs` elapses.
   */
  async waitForImageAvailable({
    imageUrn,
    timeoutMs = DEFAULT_IMAGE_WAIT_TIMEOUT_MS,
  }: WaitForImageAvailableInput): Promise<void> {
    const deadline = Date.now() + timeoutMs;

    while (true) {
      const status = await this.getImageStatus(imageUrn);

      if (status === 'AVAILABLE') {
        return;
      }

      if (status === 'PROCESSING_FAILED') {
        throw new LinkedinApiError(`LinkedIn failed to process image ${imageUrn}`, 0);
      }

      if (Date.now() >= deadline) {
        throw new LinkedinApiError(
          `Timed out waiting for image ${imageUrn} to become available`,
          0,
        );
      }

      await sleep(IMAGE_POLL_INTERVAL_MS);
    }
  }

  private async getImageStatus(imageUrn: string): Promise<string> {
    const response = await fetch(
      `${LINKEDIN_API_BASE_URL}/images/${encodeURIComponent(imageUrn)}`,
      {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'LinkedIn-Version': LINKEDIN_API_VERSION,
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );

    if (!response.ok) {
      throw await LinkedinApiError.fromResponse(response);
    }

    const body = (await response.json()) as { status: string };
    return body.status;
  }

  private jsonHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
      'LinkedIn-Version': LINKEDIN_API_VERSION,
      'X-Restli-Protocol-Version': '2.0.0',
    };
  }
}

type PostImageRef = { id: string; altText?: string };
type PostContent = { media: PostImageRef } | { multiImage: { images: PostImageRef[] } };

function toPostImageRef(image: CreatePostImageInput): PostImageRef {
  return { id: image.urn, ...(image.altText ? { altText: image.altText } : {}) };
}

// 0 images omits `content` entirely (text post), 1 uses `content.media`, and
// 2+ uses `content.multiImage` (LinkedIn requires at least 2 for multiImage).
function buildPostContent(images: CreatePostImageInput[]): { content?: PostContent } {
  const [firstImage] = images;

  if (!firstImage) {
    return {};
  }

  if (images.length === 1) {
    return { content: { media: toPostImageRef(firstImage) } };
  }

  return { content: { multiImage: { images: images.map(toPostImageRef) } } };
}

export function createLinkedinClient(accessToken: string): LinkedinClient {
  return new LinkedinClient(accessToken);
}
