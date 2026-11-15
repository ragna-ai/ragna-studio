export interface LinkedinImageUploadResponse {
  value: { uploadUrl: string; image: string };
}

export type LinkedinImageStatus = 'AVAILABLE' | 'PROCESSING_FAILED' | 'PENDING';

export interface LinkedinImageResource {
  status: LinkedinImageStatus;
}

export interface LinkedinPostImageRef {
  id: string;
  altText?: string;
}

export type LinkedinPostContent =
  | { media: LinkedinPostImageRef }
  | { multiImage: { images: LinkedinPostImageRef[] } };

export interface LinkedinPostContentBody {
  content?: LinkedinPostContent;
}
