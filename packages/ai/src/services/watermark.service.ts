// Visible AI-disclosure badge (docs/ai-labeling/prd.md part 2, Art. 50(4)):
// burns a small "AI generated" badge into an output's bottom-right corner.
// Provider-independent, used by both imagen.service.ts and
// videogen.service.ts after generation, before upload. Never sent to a
// provider: this only touches what we store.
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import sharp from 'sharp';

// Inlined rather than a separate .svg file read via fs at runtime: tsdown
// bundles this package's services into a single dist/index.mjs with no
// asset-copy step, so a path built from import.meta.url would point at a
// file that was never carried into dist (or wherever the package installs)
// in the first place. A constant needs no build config and works
// identically in dev, the built package, and any future docker image.
//
// Visible AI-disclosure badge (docs/ai-labeling/prd.md part 2): styled like
// a copyright mark, a thin ring with "AI" centered where the C would be.
// Deliberately subtle: monochrome, semi-transparent, low opacity, no strong
// contrast.
//
// "AI" is drawn as stroked line paths, not <text>: sharp's bundled librsvg
// has no bundled font, so a <text> element would depend on whatever font
// (if any) happens to be present on the host. Stroked paths render
// identically everywhere.
//
// Two passes of the same paths: a slightly thicker, darker "shadow" layer
// underneath a thinner, lighter main layer. A single light-only stroke
// reads fine on dark footage but disappears on light footage (and vice
// versa for dark-only); the dark layer gives every stroke a faint edge so
// the badge stays legible against both, without adding real contrast or
// making it any less subtle.
const BADGE_SVG = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <g stroke="#0a0a0a" opacity="0.22" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="50" cy="50" r="42" stroke-width="7" />
    <path d="M 32 64 L 41 36 L 50 64 M 35.7 53 L 46.3 53" stroke-width="6.5" />
    <path d="M 60 36 L 60 64 M 54 36 L 66 36 M 54 64 L 66 64" stroke-width="6.5" />
  </g>
  <g stroke="#f5f5f5" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="50" cy="50" r="42" stroke-width="5" opacity="0.32" />
    <path d="M 32 64 L 41 36 L 50 64 M 35.7 53 L 46.3 53" stroke-width="5" opacity="0.44" />
    <path d="M 60 36 L 60 64 M 54 36 L 66 36 M 54 64 L 66 64" stroke-width="5" opacity="0.44" />
  </g>
</svg>
`);

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

// 10% of the image's shorter side, with a floor so the badge stays visible
// even on small outputs. Margin is relative to the badge's own diameter,
// not the frame, so it stays proportionate to the badge at every size.
const IMAGE_BADGE_SIZE_RATIO = 0.1;
const IMAGE_BADGE_MIN_DIAMETER_PX = 40;
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

// Rasterized once per call at a fixed, generously high resolution: ffmpeg's
// scale2ref filter below always scales it down to fit the actual video
// (up to ~13% of a 1080p frame's height), never up, so this stays sharp at
// every render size without needing to know the video's dimensions here.
const VIDEO_BADGE_RASTER_PX = 512;

// Sized off the main video's height (scale2ref's main_h), not the raw
// input file, so the badge stays proportionate across every resolution and
// aspect ratio Veo and BFL produce. Floor keeps it visible on short frames.
const VIDEO_BADGE_HEIGHT_RATIO = 0.12;
const VIDEO_BADGE_MIN_HEIGHT_PX = 48;
const VIDEO_BADGE_MARGIN_RATIO = 0.03;

function buildFfmpegArgs(inputPath: string, badgePath: string, outputPath: string): string[] {
  const badgeSizeExpr = `max(${VIDEO_BADGE_MIN_HEIGHT_PX},main_h*${VIDEO_BADGE_HEIGHT_RATIO})`;
  const marginExpr = `main_h*${VIDEO_BADGE_MARGIN_RATIO}`;

  // [1:v] (badge) is scaled relative to [0:v] (main video) via scale2ref's
  // main_h, a square badge so w and h use the same expression. The scaled
  // main video passes through unchanged as [vid]; overlay then burns the
  // badge into its bottom-right corner. Video re-encodes through the
  // filter; audio is copied untouched.
  const filterComplex =
    `[1:v][0:v]scale2ref=w='${badgeSizeExpr}':h='${badgeSizeExpr}'[wm][vid];` +
    `[vid][wm]overlay=x='main_w-overlay_w-${marginExpr}':y='main_h-overlay_h-${marginExpr}':format=auto[outv]`;

  return [
    '-y',
    '-i',
    inputPath,
    '-i',
    badgePath,
    '-filter_complex',
    filterComplex,
    '-map',
    '[outv]',
    '-map',
    '0:a?',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'copy',
    outputPath,
  ];
}

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
 * Burns the badge into a video's bottom-right corner via an ffmpeg overlay
 * filter, re-encoding the video stream and copying audio untouched. Runs in
 * the videogen path (worker process, every route: standard, draft,
 * enhance) after generation, before upload. Input/output travel through
 * temp files (ffmpeg has no stdin/stdout mp4 muxing story worth relying
 * on), cleaned up in the finally block regardless of outcome.
 */
export async function applyVideoWatermark({
  buffer,
}: ApplyVideoWatermarkParams): Promise<ApplyVideoWatermarkResult> {
  if (!ffmpegPath) {
    throw new Error('ffmpeg-static did not resolve a binary for this platform');
  }

  const workDir = await mkdtemp(join(tmpdir(), 'gen-video-watermark-'));
  const inputPath = join(workDir, 'input.mp4');
  const badgePath = join(workDir, 'badge.png');
  const outputPath = join(workDir, 'output.mp4');

  try {
    const badgePng = await renderBadgePng(VIDEO_BADGE_RASTER_PX);
    await Promise.all([writeFile(inputPath, buffer), writeFile(badgePath, badgePng)]);

    await runFfmpeg(ffmpegPath, buildFfmpegArgs(inputPath, badgePath, outputPath));

    const watermarked = await readFile(outputPath);
    return { buffer: watermarked };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
