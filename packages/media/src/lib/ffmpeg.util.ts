// packages/media/src/lib/ffmpeg.util.ts
//
// System-installed ffmpeg, resolved via PATH: brew on dev machines, apt in
// the Docker image (ffmpeg comes from the system, not npm). No config knob:
// every environment this runs in already has ffmpeg on PATH.
import { spawn } from 'node:child_process';

export const FFMPEG_BINARY = 'ffmpeg';

// stderr tail only: ffmpeg logs its actual error in the last few lines,
// everything before that is codec/build banner noise not worth keeping.
const STDERR_TAIL_CHARS = 4000;

export function runFfmpeg(binaryPath: string, args: string[]): Promise<void> {
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
