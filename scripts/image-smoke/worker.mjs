// Smoke test for the worker image. Mounted into /app and run with `bun`, so
// packages resolve exactly as the worker resolves them.
// Usage: bun image-smoke.mjs <video>...   (needs REDIS_HOST / REDIS_PORT)
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { applyVideoWatermark, extractText, probeVideoDimensions } from '@repo/media';

const PDF_TEXT = 'RAGNA image smoke';

/** Builds a one-page PDF with valid xref offsets. */
function buildPdf(text) {
  const stream = `BT /F1 24 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = objects.map((body, index) => {
    const offset = pdf.length;
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
    return offset;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf);
}

async function checkPdfExtraction() {
  const text = await extractText({ buffer: buildPdf(PDF_TEXT), kind: 'pdf' });
  if (!text.includes(PDF_TEXT)) throw new Error(`pdf: unexpected text ${JSON.stringify(text)}`);
  console.log('pdf extraction ok');
}

async function checkVideoWatermark(videoPath) {
  const input = await readFile(videoPath);
  const { buffer } = await applyVideoWatermark({ buffer: input });
  const outputPath = `/tmp/watermarked-${videoPath.split('/').pop()}.mp4`;
  await Bun.write(outputPath, buffer);
  const dimensions = await probeVideoDimensions('ffmpeg', outputPath);
  console.log(
    `watermark ok: ${videoPath} -> ${buffer.length} bytes, ${dimensions.width}x${dimensions.height}`,
  );
}

async function checkBullmqRoundTrip() {
  const queueRequire = createRequire(
    createRequire(import.meta.url).resolve('@repo/queue/package.json'),
  );
  const { Queue, Worker } = queueRequire('bullmq');
  const connection = { host: process.env.REDIS_HOST, port: Number(process.env.REDIS_PORT) };
  const name = `image-smoke-${Date.now()}`;
  const queue = new Queue(name, { connection });
  const worker = new Worker(name, async (job) => job.data.value * 2, { connection });
  try {
    const job = await queue.add('double', { value: 21 });
    for (let attempt = 0; attempt < 50 && !(await job.isCompleted()); attempt++)
      await Bun.sleep(200);
    const finished = await queue.getJob(job.id);
    if (finished?.returnvalue !== 42)
      throw new Error(`bullmq: unexpected result ${finished?.returnvalue}`);
    console.log('bullmq round trip ok');
  } finally {
    await worker.close();
    await queue.obliterate({ force: true });
    await queue.close();
  }
}

await checkPdfExtraction();
for (const videoPath of process.argv.slice(2)) await checkVideoWatermark(videoPath);
await checkBullmqRoundTrip();
