// packages/media/src/services/watermark.service.ts
//
// Visible AI-disclosure badge (EU AI Act Art. 50(4)):
// burns a small "AI generated" badge into an output's bottom-right corner.
// Provider-independent, used by both imagen.service.ts and
// videogen.service.ts (@repo/ai) after generation, before upload. Never sent
// to a provider: this only touches what we store.
//
// Best-effort by design: a
// failed watermark must never lose a paid generation, so this module throws
// on failure rather than swallowing errors, and deliberately does not depend
// on @repo/logger. The caller decides what "best-effort" means (log a
// warning, fall back to the raw bytes, flip visibleWatermark), not this
// package.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { buildWatermarkFfmpegArgs, probeVideoDimensions } from '../lib/watermark-ffmpeg.util';

// System-installed ffmpeg, resolved via PATH: brew on dev machines, apt in
// the Docker image (both put it on PATH; ffmpeg comes from the system, not
// npm). No config knob: every environment this
// runs in already has ffmpeg on PATH, so an override would have nothing to
// point at.
const FFMPEG_BINARY = 'ffmpeg';

// A real asset file rather than an inlined string: tsdown's `copy` option
// (tsdown.config.ts) carries assets/ai-badge.svg into dist/assets/, and this
// path is resolved relative to import.meta.url of the built module. tsdown
// bundles this package into a single dist/index.mjs, so the literal string
// below resolves against that file's location regardless of which src file
// it was authored in; it does NOT need to match this file's position under
// src/. Loaded once at import time, same as the previous inlined constant.
//
// Styled like a copyright mark, a thin ring with "AI" centered where the C
// would be. Deliberately subtle: monochrome, semi-transparent, low opacity,
// no strong contrast.
//
// "AI" is drawn as stroked line paths, not <text>: sharp's bundled librsvg
// has no bundled font, so a <text> element would depend on whatever font (if
// any) happens to be present on the host. Stroked paths render identically
// everywhere.
//
// Two passes of the same paths: a slightly thicker, darker "shadow" layer
// underneath a thinner, lighter main layer. A single light-only stroke reads
// fine on dark footage but disappears on light footage (and vice versa for
// dark-only); the dark layer gives every stroke a faint edge so the badge
// stays legible against both, without adding real contrast or making it any
// less subtle.
const BADGE_SVG = readFileSync(new URL('./assets/ai-badge.svg', import.meta.url));

// The badge's own viewBox is 100x100 units; density (SVG "dots per inch")
// is how sharp/librsvg controls raster output size for a vector source.
// Default density is 72, which rasterizes 1 viewBox unit to 1 pixel, so
// scaling density scales the raster output proportionally.
const BADGE_VIEWBOX_PX = 100;
const BADGE_BASE_DENSITY = 72;

async function renderBadgePng(diameterPx: number): Promise<Buffer> {
  const density = Math.max(
    BADGE_BASE_DENSITY,
    Math.round((diameterPx / BADGE_VIEWBOX_PX) * BADGE_BASE_DENSITY),
  );

  return sharp(BADGE_SVG, { density }).png().toBuffer();
}

export interface ApplyImageWatermarkParams {
  buffer: Buffer;
  mimeType: string;
}

export interface ApplyImageWatermarkResult {
  buffer: Buffer;
}

// 3.3% of the image's shorter side, with a floor so the badge stays visible
// even on small outputs. Margin is relative to the badge's own diameter,
// not the frame, so it stays proportionate to the badge at every size.
const IMAGE_BADGE_SIZE_RATIO = 0.033;
const IMAGE_BADGE_MIN_DIAMETER_PX = 14;
const IMAGE_BADGE_MARGIN_RATIO = 0.4;

function resolveSharpFormat(mimeType: string): 'png' | 'jpeg' | 'webp' {
  if (mimeType === 'image/jpeg') {
    return 'jpeg';
  }

  if (mimeType === 'image/webp') {
    return 'webp';
  }

  return 'png';
}

/**
 * Composites the rasterized badge onto an image's bottom-right corner.
 * Runs in the imagegen path (API process, synchronous): sharp only, no
 * ffmpeg, so this adds tens of milliseconds, not seconds.
 */
export async function applyImageWatermark({
  buffer,
  mimeType,
}: ApplyImageWatermarkParams): Promise<ApplyImageWatermarkResult> {
  const { width = 0, height = 0 } = await sharp(buffer).metadata();
  const shortSide = Math.min(width, height) || Math.max(width, height);
  const diameter = Math.max(
    IMAGE_BADGE_MIN_DIAMETER_PX,
    Math.round(shortSide * IMAGE_BADGE_SIZE_RATIO),
  );
  const margin = Math.round(diameter * IMAGE_BADGE_MARGIN_RATIO);

  const badgePng = await renderBadgePng(diameter);
  const badgeMeta = await sharp(badgePng).metadata();
  const badgeWidth = badgeMeta.width ?? diameter;
  const badgeHeight = badgeMeta.height ?? diameter;

  const left = Math.max(0, width - badgeWidth - margin);
  const top = Math.max(0, height - badgeHeight - margin);

  const watermarked = await sharp(buffer)
    .composite([{ input: badgePng, left, top }])
    .toFormat(resolveSharpFormat(mimeType))
    .toBuffer();

  return { buffer: watermarked };
}

export interface ApplyVideoWatermarkParams {
  buffer: Buffer;
}

export interface ApplyVideoWatermarkResult {
  buffer: Buffer;
}

// Sized off the probed input video's height, not a fixed raster guess: the
// badge is rasterized at exactly the size the overlay needs, so there is no
// in-graph scaling left for ffmpeg to get wrong across versions (the bug
// this whole pipeline replaces). Floor keeps it visible on short frames.
const VIDEO_BADGE_HEIGHT_RATIO = 0.04;
const VIDEO_BADGE_MIN_HEIGHT_PX = 16;
const VIDEO_BADGE_MARGIN_RATIO = 0.03;

// stderr tail only: ffmpeg logs its actual error in the last few lines,
// everything before that is codec/build banner noise not worth keeping.
const STDERR_TAIL_CHARS = 4000;

function runFfmpeg(binaryPath: string, args: string[]): Promise<void> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(binaryPath, args);
    let stderrTail = '';

    child.stderr.on('data', (chunk: Buffer) => {
      stderrTail = (stderrTail + chunk.toString()).slice(-STDERR_TAIL_CHARS);
    });

    child.on('error', rejectPromise);
    child.on('close', (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      rejectPromise(new Error(`ffmpeg exited with code ${code}: ${stderrTail}`));
    });
  });
}

/**
 * Burns the badge into a video's bottom-right corner. Runs in the videogen
 * path (worker process, every route: standard, draft, enhance) after
 * generation, before upload. Version-proof pipeline:
 * probe the input's real dimensions first (there is no
 * ffprobe), rasterize the badge in Node at the exact pixel size the overlay
 * needs, then a single `overlay` pass with precomputed integer offsets. No
 * `scale2ref`, no in-graph scaling of any kind: that filter behaves
 * differently across ffmpeg 6/7/8 (7.0.2 silently drops the video stream, 8
 * removed it), a plain overlay does not.
 *
 * Input/output travel through temp files (ffmpeg has no stdin/stdout mp4
 * muxing story worth relying on), cleaned up in the finally block regardless
 * of outcome.
 */
export async function applyVideoWatermark({
  buffer,
}: ApplyVideoWatermarkParams): Promise<ApplyVideoWatermarkResult> {
  const workDir = await mkdtemp(join(tmpdir(), 'gen-video-watermark-'));
  const inputPath = join(workDir, 'input.mp4');
  const badgePath = join(workDir, 'badge.png');
  const outputPath = join(workDir, 'output.mp4');

  try {
    await writeFile(inputPath, buffer);

    const { height } = await probeVideoDimensions(FFMPEG_BINARY, inputPath);
    const diameter = Math.max(VIDEO_BADGE_MIN_HEIGHT_PX, Math.round(height * VIDEO_BADGE_HEIGHT_RATIO));
    const margin = Math.round(height * VIDEO_BADGE_MARGIN_RATIO);

    const badgePng = await renderBadgePng(diameter);
    await writeFile(badgePath, badgePng);

    const args = buildWatermarkFfmpegArgs({ inputPath, badgePath, outputPath, margin });
    await runFfmpeg(FFMPEG_BINARY, args);

    const watermarked = await readFile(outputPath);
    return { buffer: watermarked };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
