// packages/media-transform/src/services/resize.service.ts
import sharp from 'sharp';

export interface ResizeImageToSquareWebpParams {
  buffer: Buffer;
  size: number;
}

/** Center-cropped square, lossless WebP. */
export async function resizeImageToSquareWebp({
  buffer,
  size,
}: ResizeImageToSquareWebpParams): Promise<Buffer> {
  return sharp(buffer)
    .resize(size, size, { fit: 'cover', position: 'centre' })
    .webp({ lossless: true })
    .toBuffer();
}
