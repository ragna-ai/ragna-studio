import type { VendorClient } from '../../http';
import { LinkedinPublishError } from '../errors';
import { createLinkedinClient, withLinkedinErrors } from './linkedin.client';
import { parseImageResource, parseImageUploadResponse, parsePostId } from './linkedin.parse';
import type {
  LinkedinImageUploadResponse,
  LinkedinPostContentBody,
  LinkedinPostImageRef,
} from './linkedin.types';

const IMAGE_POLL_INTERVAL_MS = 1500;
const IMAGE_WAIT_TIMEOUT_MS = 45_000;
const MAX_IMAGE_POLLS = Math.ceil(IMAGE_WAIT_TIMEOUT_MS / IMAGE_POLL_INTERVAL_MS);
const UPLOAD_TIMEOUT_MS = 120_000;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface UploadLinkedinImageParams {
  bytes: Buffer;
  mimeType: string;
  altText?: string;
}

export interface LinkedinImage {
  /** Opaque. Only valid with the connection it came from. */
  id: string;
  altText?: string;
}

export interface PublishLinkedinPostParams {
  text: string;
  images: LinkedinImage[];
}

export interface LinkedinPost {
  /** Opaque. */
  id: string;
  url: string;
}

export interface LinkedinPublisher {
  uploadImage(params: UploadLinkedinImageParams): Promise<LinkedinImage>;
  publishPost(params: PublishLinkedinPostParams): Promise<LinkedinPost>;
}

export interface LinkedinPublisherOptions {
  /** Resolves a fresh, valid OAuth access token for the connection. */
  getAccessToken: () => Promise<string>;
  /** LinkedIn person id: the connection's `externalAccountId`. */
  authorId: string;
  /** Waits between retries and image status polls. Tests pass a recorder so nothing really waits. */
  sleep?: (ms: number) => Promise<void>;
}

function toImageRef(image: LinkedinImage): LinkedinPostImageRef {
  return { id: image.id, ...(image.altText ? { altText: image.altText } : {}) };
}

/** No images omits `content`, one uses `content.media`, two or more `content.multiImage`. */
function buildPostContent(images: LinkedinImage[]): LinkedinPostContentBody {
  const [firstImage] = images;
  if (!firstImage) return {};
  if (images.length === 1) return { content: { media: toImageRef(firstImage) } };
  return { content: { multiImage: { images: images.map(toImageRef) } } };
}

class LinkedinHttpPublisher implements LinkedinPublisher {
  private readonly client: VendorClient;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly options: LinkedinPublisherOptions) {
    this.client = createLinkedinClient(options);
    this.sleep = options.sleep ?? defaultSleep;
  }

  async uploadImage(params: UploadLinkedinImageParams): Promise<LinkedinImage> {
    const registration = await this.registerImageUpload();
    await withLinkedinErrors(() =>
      this.client.requestRaw(registration.value.uploadUrl, {
        method: 'PUT',
        body: params.bytes,
        headers: { 'Content-Type': params.mimeType },
        authorize: true,
        timeoutMs: UPLOAD_TIMEOUT_MS,
      }),
    );
    await this.waitForImage(registration.value.image);
    return { id: registration.value.image, altText: params.altText };
  }

  async publishPost(params: PublishLinkedinPostParams): Promise<LinkedinPost> {
    const response = await withLinkedinErrors(() =>
      this.client.requestRaw('posts', {
        method: 'POST',
        body: JSON.stringify({
          author: `urn:li:person:${this.options.authorId}`,
          commentary: params.text,
          visibility: 'PUBLIC',
          distribution: {
            feedDistribution: 'MAIN_FEED',
            targetEntities: [],
            thirdPartyDistributionChannels: [],
          },
          lifecycleState: 'PUBLISHED',
          isReshareDisabledByAuthor: false,
          ...buildPostContent(params.images),
        }),
        headers: { 'Content-Type': 'application/json' },
        authorize: true,
      }),
    );
    const id = parsePostId(response.headers.get('x-restli-id'));
    return { id, url: `https://www.linkedin.com/feed/update/${id}` };
  }

  private async registerImageUpload(): Promise<LinkedinImageUploadResponse> {
    const body = await withLinkedinErrors(() =>
      this.client.request<unknown>('images?action=initializeUpload', {
        method: 'POST',
        body: JSON.stringify({
          initializeUploadRequest: { owner: `urn:li:person:${this.options.authorId}` },
        }),
        idempotent: true,
      }),
    );
    return parseImageUploadResponse(body);
  }

  private async waitForImage(imageId: string): Promise<void> {
    for (let poll = 0; poll < MAX_IMAGE_POLLS; poll++) {
      const body = await withLinkedinErrors(() =>
        this.client.request<unknown>(`images/${encodeURIComponent(imageId)}`),
      );
      const { status } = parseImageResource(body);
      if (status === 'AVAILABLE') return;
      if (status === 'PROCESSING_FAILED') {
        throw new LinkedinPublishError('image_failed', 'LinkedIn could not process the image');
      }
      if (poll < MAX_IMAGE_POLLS - 1) await this.sleep(IMAGE_POLL_INTERVAL_MS);
    }
    throw new LinkedinPublishError('image_failed', 'LinkedIn did not finish processing the image');
  }
}

export function createLinkedinPublisher(options: LinkedinPublisherOptions): LinkedinPublisher {
  return new LinkedinHttpPublisher(options);
}
