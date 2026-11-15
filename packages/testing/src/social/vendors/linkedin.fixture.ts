// packages/testing/src/social/vendors/linkedin.fixture.ts
//
// Trimmed LinkedIn versioned REST payloads (images, posts), ids and people replaced.

export const LINKEDIN_UPLOAD_HOST = 'www.linkedin.com';
export const LINKEDIN_POST_ID = 'urn:li:share:7261234567890123456';

export function linkedinImageUrn(suffix: string): string {
  return `urn:li:image:C4D10AQ${suffix}`;
}

export function linkedinInitializeUploadResponse(suffix: string) {
  return {
    value: {
      uploadUrl: `https://${LINKEDIN_UPLOAD_HOST}/dms-uploads/${suffix}`,
      uploadUrlExpiresAt: 1_793_000_000_000,
      image: linkedinImageUrn(suffix),
    },
  };
}

export function linkedinImageResource(status: string) {
  return { status, downloadUrlExpiresAt: 1_793_000_000_000 };
}

export const LINKEDIN_ERROR_BODY = {
  status: 500,
  code: 'INTERNAL_SERVER_ERROR',
  message: 'Internal Server Error',
};
