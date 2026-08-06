// packages/media/src/lib/watermark-ffmpeg.util.ts
//
// Version-proof ffmpeg pieces for the video watermark (docs/ai-labeling/
// prd.md "Processing", revision 1). ffmpeg 6/7/8 disagree on `scale2ref`
// (7.0.2 on Linux silently drops the video stream through it, 8 removed the
// filter entirely), so the graph below does no in-graph scaling at all: the
// badge is pre-rasterized in Node at its final pixel size, and the filter
// graph is a single `overlay` with precomputed integer offsets.
import { spawn } from 'node:child_process';

export interface VideoDimensions {
  width: number;
  height: number;
}

// Matches the one line ffmpeg prints per video stream, e.g.:
//   Stream #0:0(und): Video: h264 ..., yuv420p, 1280x720 [SAR 1:1 DAR 16:9], ...
// Scoped to that single line before the dimensions regex runs: a video's
// metadata can contain other NxM-shaped tokens elsewhere in stderr (bitrates,
// SAR/DAR ratios use ':' not 'x', but nothing guarantees every build's
// banner text does), so matching blind against the whole stderr blob risks
// picking up the wrong pair of numbers.
const VIDEO_STREAM_LINE_PATTERN = /Stream #\d+:\d+.*Video:.*/;
const DIMENSIONS_PATTERN = /\b(\d{2,5})x(\d{2,5})\b/;

function captureFfmpegStderr(ffmpegPath: string, args: string[]): Promise<string> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(ffmpegPath, args);
    let stderr = '';

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on('error', rejectPromise);
    // `-i` with no output always exits non-zero ("At least one output file
    // must be specified"), but the stream info we need is already in stderr
    // by the time ffmpeg gets there, so the exit code is irrelevant here:
    // only a failed regex match below turns into an error.
    child.on('close', () => resolvePromise(stderr));
  });
}

/**
 * Probes a video file's dimensions via ffmpeg's own stderr banner. There is
 * no ffprobe binary bundled anywhere in this stack, so this is the only
 * source of the input's resolution ahead of the overlay pass.
 */
export async function probeVideoDimensions(
  ffmpegPath: string,
  inputPath: string,
): Promise<VideoDimensions> {
  const stderr = await captureFfmpegStderr(ffmpegPath, ['-i', inputPath]);
  const videoLine = stderr.split('\n').find((line) => VIDEO_STREAM_LINE_PATTERN.test(line));

  if (!videoLine) {
    throw new Error(`ffmpeg reported no video stream for ${inputPath}`);
  }

  const match = DIMENSIONS_PATTERN.exec(videoLine);

  if (!match) {
    throw new Error(`Could not parse video dimensions from ffmpeg output: ${videoLine}`);
  }

  return { width: Number(match[1]), height: Number(match[2]) };
}

export interface BuildWatermarkFfmpegArgsParams {
  inputPath: string;
  badgePath: string;
  outputPath: string;
  // Precomputed pixel offset from both edges, not an ffmpeg expression: the
  // badge is already rasterized at its final on-screen size (Node computes
  // that from the probed height, see watermark.service.ts), so the filter
  // graph itself never scales anything.
  margin: number;
}

/**
 * Pure args builder for the overlay pass, kept separate from the spawn call
 * so it is testable standalone. `[0:v][1:v]overlay=...` has exactly one
 * output pad, labeled `[outv]` so `-map` can target it unambiguously; audio
 * is copied through untouched and made optional (`0:a?`) since a source clip
 * may have no audio stream at all.
 */
export function buildWatermarkFfmpegArgs({
  inputPath,
  badgePath,
  outputPath,
  margin,
}: BuildWatermarkFfmpegArgsParams): string[] {
  const filterComplex = `[0:v][1:v]overlay=x=main_w-overlay_w-${margin}:y=main_h-overlay_h-${margin}[outv]`;

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
