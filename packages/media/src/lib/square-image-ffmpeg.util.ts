// packages/media/src/lib/square-image-ffmpeg.util.ts

export interface BuildSquareImageFfmpegArgsParams {
  inputPath: string;
  outputPath: string;
  sizePx: number;
}

/**
 * Pure args builder: scale the image until it covers a size x size square, then crop the
 * centre. Avoids filter expressions with commas, so it needs no escaping.
 */
export function buildSquareImageFfmpegArgs({
  inputPath,
  outputPath,
  sizePx,
}: BuildSquareImageFfmpegArgsParams): string[] {
  const filter = `scale=${sizePx}:${sizePx}:force_original_aspect_ratio=increase:flags=lanczos,crop=${sizePx}:${sizePx}`;

  return ['-y', '-i', inputPath, '-vf', filter, '-frames:v', '1', outputPath];
}
