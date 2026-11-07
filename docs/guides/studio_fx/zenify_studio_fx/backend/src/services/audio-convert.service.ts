import { spawn } from 'child_process';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Readable } from 'stream';

/**
 * Format conversion only: the app renders FX on the device and uploads the
 * result (WAV in, mp3/m4a/flac out). The server never fetches audio from a URL
 * and never talks to YouTube, which removes the SSRF hole of the old
 * processAndStream() and keeps the server off YouTube's block lists.
 *
 * Fixes versus the old service:
 *  - no server-side fetch of a client-supplied URL (SSRF)
 *  - capped concurrency + queue, so 1,000 users cannot spawn 1,000 ffmpeg processes
 *  - m4a to a pipe needs fragmented MP4 (plain `-f mp4` fails on non-seekable output)
 *  - sanitised filename (no header injection), hard timeout, killed on client disconnect
 *  - streams through Fastify (reply.send(stream)) so errors and backpressure are handled
 */

const FORMATS: Record<string, { args: string[]; mime: string; ext: string }> = {
  mp3: { args: ['-f', 'mp3', '-c:a', 'libmp3lame', '-b:a', '320k'], mime: 'audio/mpeg', ext: 'mp3' },
  m4a: {
    args: ['-f', 'mp4', '-movflags', '+frag_keyframe+empty_moov+default_base_moof', '-c:a', 'aac', '-b:a', '256k'],
    mime: 'audio/mp4',
    ext: 'm4a',
  },
  flac: { args: ['-f', 'flac', '-c:a', 'flac'], mime: 'audio/flac', ext: 'flac' },
  wav: { args: ['-f', 'wav', '-c:a', 'pcm_s16le'], mime: 'audio/wav', ext: 'wav' },
};

const MAX_JOBS = Number(process.env.FFMPEG_MAX_JOBS ?? 2);
const MAX_QUEUE = Number(process.env.FFMPEG_MAX_QUEUE ?? 20);
const JOB_TIMEOUT_MS = Number(process.env.FFMPEG_TIMEOUT_MS ?? 120_000);

let running = 0;
const waiting: Array<() => void> = [];

async function acquire(): Promise<boolean> {
  if (running < MAX_JOBS) {
    running++;
    return true;
  }
  if (waiting.length >= MAX_QUEUE) return false;
  await new Promise<void>((resolve) => waiting.push(resolve));
  running++;
  return true;
}

function release() {
  running--;
  waiting.shift()?.();
}

const safeName = (s: string) =>
  (s.replace(/[^\w\- .()]/g, '').trim().slice(0, 120)) || 'audio';

export class AudioConvertService {
  static async convert(request: FastifyRequest, reply: FastifyReply, input: Readable) {
    const q = request.query as { format?: string; filename?: string };
    const fmt = FORMATS[(q.format ?? '').toLowerCase()];
    if (!fmt) return reply.code(400).send({ error: 'format must be mp3, m4a, flac or wav' });

    if (!(await acquire())) {
      return reply.code(429).header('Retry-After', '10').send({ error: 'Converter busy, try again shortly' });
    }

    const ff = spawn(
      'ffmpeg',
      ['-hide_banner', '-loglevel', 'error', '-nostdin', '-threads', '1', '-i', 'pipe:0', '-vn', '-map_metadata', '-1', ...fmt.args, 'pipe:1'],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );

    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      release();
    };
    const kill = () => {
      try { ff.kill('SIGKILL'); } catch { /* already gone */ }
    };

    const timer = setTimeout(kill, JOB_TIMEOUT_MS);
    ff.on('close', done);
    ff.on('error', () => { kill(); done(); });
    ff.stderr.on('data', (d) => request.log.warn({ ffmpeg: String(d).slice(0, 500) }));

    input.on('error', kill);
    input.pipe(ff.stdin).on('error', () => { /* ffmpeg closed early */ });
    request.raw.on('close', () => { if (!finished) kill(); }); // client went away

    return reply
      .header('Content-Type', fmt.mime)
      .header('Content-Disposition', `attachment; filename="${safeName(q.filename ?? 'audio')}.${fmt.ext}"`)
      .header('Cache-Control', 'no-store')
      .send(ff.stdout);
  }
}

/*
 * Route wiring (replaces the old /tracks/:id/process-download and /tracks/convert-format):
 *
 *   // accept the raw WAV body as a stream instead of buffering it
 *   app.addContentTypeParser(['audio/wav', 'audio/x-wav', 'application/octet-stream'],
 *     (_req, payload, done) => done(null, payload));
 *
 *   app.post('/v1/audio/convert', {
 *     bodyLimit: 150 * 1024 * 1024,                       // about 14 minutes of 16-bit stereo WAV
 *     config: { rateLimit: { max: 6, timeWindow: '1 minute' } },   // @fastify/rate-limit
 *   }, (req, reply) => AudioConvertService.convert(req, reply, req.body as Readable));
 *
 * Delete: AudioProcessorService.processAndStream and its route (it fetched a URL
 * supplied by the client, and the server cannot reach YouTube audio anyway).
 */
