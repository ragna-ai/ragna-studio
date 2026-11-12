// packages/media/src/services/square-image.service.ts
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FFMPEG_BINARY, runFfmpeg } from '../lib/ffmpeg.util';
import { buildSquareImageFfmpegArgs } from '../lib/square-image-ffmpeg.util';

export interface ScaleImageToSquarePngParams {
  buffer: Buffer;
  sizePx: number;
}

/**
 * Centre-crops an image to a square and scales it to sizePx x sizePx, as PNG. Input and output
 * travel through temp files, removed in the finally block whatever happens.
 */
export async function scaleImageToSquarePng({
  buffer,
  sizePx,
}: ScaleImageToSquarePngParams): Promise<Buffer> {
  const workDir = await mkdtemp(join(tmpdir(), 'square-image-'));
  const inputPath = join(workDir, 'input');
  const outputPath = join(workDir, 'output.png');

  try {
    await writeFile(inputPath, buffer);
    await runFfmpeg(FFMPEG_BINARY, buildSquareImageFfmpegArgs({ inputPath, outputPath, sizePx }));
    return await readFile(outputPath);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
