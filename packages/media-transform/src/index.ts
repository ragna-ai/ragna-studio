// packages/media-transform/src/index.ts
//
// @repo/media-transform: pure bytes-in, bytes-out image and video transforms
// (sharp, system ffmpeg). No database, storage or logger dependencies.

export { resizeImageToSquareWebp } from './services/resize.service';
export type { ResizeImageToSquareWebpParams } from './services/resize.service';

// Visible AI-disclosure watermark (EU AI Act Art. 50(4)).
export { applyImageWatermark, applyVideoWatermark } from './services/watermark.service';
export type {
  ApplyImageWatermarkParams,
  ApplyImageWatermarkResult,
  ApplyVideoWatermarkParams,
  ApplyVideoWatermarkResult,
} from './services/watermark.service';
export { buildWatermarkFfmpegArgs, probeVideoDimensions } from './lib/watermark-ffmpeg.util';
export type { BuildWatermarkFfmpegArgsParams, VideoDimensions } from './lib/watermark-ffmpeg.util';
