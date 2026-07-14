// LinkedIn's versioned REST API requires this header on every request.
// LinkedIn ships a new version every month, named by year and month (YYYYMM).
// Bump this constant when the API introduces breaking changes we need.
export const LINKEDIN_API_VERSION = '202506';

const LINKEDIN_API_BASE_URL = 'https://api.linkedin.com/rest';

export interface CreateTextPostInput {
  /** The LinkedIn person id (better-auth stores this as `account.accountId`). */
  authorId: string;
  text: string;
}

export interface CreateTextPostResult {
  /** e.g. `urn:li:share:123456789` */
  urn: string;
  url: string;
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
}

/**
 * Thin client for the LinkedIn versioned REST API (`/rest/*`).
 * v1 only needs to publish text posts; media support is a later phase.
 */
export class LinkedinClient {
  constructor(private readonly accessToken: string) {}

  async createTextPost({ authorId, text }: CreateTextPostInput): Promise<CreateTextPostResult> {
    const response = await fetch(`${LINKEDIN_API_BASE_URL}/posts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        'LinkedIn-Version': LINKEDIN_API_VERSION,
        'X-Restli-Protocol-Version': '2.0.0',
      },
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
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new LinkedinApiError(
        `LinkedIn API error: ${response.status} ${response.statusText}`,
        response.status,
        errorBody,
      );
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
}

export function createLinkedinClient(accessToken: string): LinkedinClient {
  return new LinkedinClient(accessToken);
}
