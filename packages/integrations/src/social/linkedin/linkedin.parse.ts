import * as z from 'zod';
import { LinkedinPublishError } from '../errors';
import type { LinkedinImageResource, LinkedinImageUploadResponse } from './linkedin.types';

const imageUploadResponseSchema = z.object({
  value: z.object({ uploadUrl: z.string().min(1), image: z.string().min(1) }),
});

const imageResourceSchema = z.object({
  status: z
    .string()
    .transform((status): LinkedinImageResource['status'] => {
      if (status === 'AVAILABLE' || status === 'PROCESSING_FAILED') return status;
      return 'PENDING';
    })
    .catch('PENDING'),
});

function rejected(step: string): LinkedinPublishError {
  return new LinkedinPublishError('rejected', `LinkedIn sent an unexpected answer (${step})`);
}

export function parseImageUploadResponse(body: unknown): LinkedinImageUploadResponse {
  const parsed = imageUploadResponseSchema.safeParse(body);
  if (!parsed.success) throw rejected('register image');
  return parsed.data;
}

export function parseImageResource(body: unknown): LinkedinImageResource {
  const parsed = imageResourceSchema.safeParse(body);
  if (!parsed.success) throw rejected('image status');
  return parsed.data;
}

export function parsePostId(header: string | null): string {
  if (!header) throw rejected('create post');
  return header;
}
