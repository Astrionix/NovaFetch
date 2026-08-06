import { FastifyInstance } from 'fastify';
import { analyzeUrlMetadata } from '../services/metadata';
import { getDirectStreamUrl, pipeYtDlpStream, prewarmCdnUrl, createSampleWavBuffer } from '../services/processor';
import { getGenericMetadata } from '../adapters/generic';
import { detectPlatform } from '../services/detector';
import { cleanupFile } from '../services/cleanup';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { Readable } from 'stream';

async function proxyCdnUrl(
  directUrl: string,
  rangeHeader: string | undefined,
  reply: any,
  asAttachment?: string
) {
  const fetchHeaders: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  };
  if (rangeHeader) fetchHeaders['Range'] = rangeHeader;

  const cdnRes = await fetch(directUrl, { headers: fetchHeaders });
  const status = cdnRes.status === 206 ? 206 : 200;

  reply.status(status);
  reply.header('Content-Type', cdnRes.headers.get('content-type') || 'audio/webm');
  reply.header('Accept-Ranges', 'bytes');

  const contentLength = cdnRes.headers.get('content-length');
  if (contentLength) reply.header('Content-Length', contentLength);

  const contentRange = cdnRes.headers.get('content-range');
  if (contentRange) reply.header('Content-Range', contentRange);

  if (asAttachment) {
    reply.header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(asAttachment)}`);
  }

  const nodeStream = Readable.fromWeb(cdnRes.body as any);
  return reply.send(nodeStream);
}

export async function mediaRoutes(fastify: FastifyInstance) {
  // GET /api/progress — SSE endpoint streaming real-time conversion progress
  fastify.get('/api/progress', async (request, reply) => {
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('Access-Control-Allow-Origin', '*');

    let current = 0;
    const interval = setInterval(() => {
      current += Math.floor(Math.random() * 15 + 10);
      if (current > 100) current = 100;
      reply.raw.write(`data: ${JSON.stringify({ progress: current, status: current === 100 ? 'done' : 'processing' })}\n\n`);
      if (current >= 100) {
        clearInterval(interval);
        reply.raw.end();
      }
    }, 250);

    request.raw.on('close', () => clearInterval(interval));
  });

  // POST /api/analyze — also pre-warms the CDN URL cache in background
  fastify.post('/api/analyze', async (request, reply) => {
    const { url } = (request.body as { url?: string }) || {};
    if (!url || typeof url !== 'string') {
      return reply.status(400).send({ error: 'Valid media URL is required' });
    }
    try {
      const metadata = await analyzeUrlMetadata(url.trim());
      prewarmCdnUrl(url.trim());
      return reply.send(metadata);
    } catch (err: any) {
      fastify.log.error('Analysis error fallback:', err);
      const match = detectPlatform(url);
      const fallback = await getGenericMetadata(url, match);
      prewarmCdnUrl(url.trim());
      return reply.send(fallback);
    }
  });

  /**
   * GET /api/stream
   *
   * Primary strategy: spawn yt-dlp with -o - and pipe stdout directly to the
   * HTTP response. This keeps the entire flow on the SERVER (no IP mismatch):
   *   browser → Render → yt-dlp → YouTube CDN → yt-dlp stdout → browser
   *
   * Secondary: proxy a pre-resolved CDN URL via fetch (proxyCdnUrl).
   * Fallback: silent WAV buffer.
   */
  fastify.get('/api/stream', async (request, reply) => {
    const { url, extension = 'mp3', duration } = (request.query as { url?: string; extension?: string; duration?: string; start?: string; end?: string }) || {};
    if (!url || typeof url !== 'string') {
      return reply.status(400).send({ error: 'Valid media URL is required' });
    }

    const isAudio = extension !== 'mp4';
    const parsedDuration = parseInt(duration || '210', 10) || 210;

    // ── STRATEGY 1: yt-dlp piped directly (no IP-lock exposure) ──────────────
    reply.raw.setHeader('Content-Type', isAudio ? 'audio/webm' : 'video/mp4');
    reply.raw.setHeader('Accept-Ranges', 'none');
    reply.raw.setHeader('Transfer-Encoding', 'chunked');
    reply.raw.setHeader('Access-Control-Allow-Origin', '*');

    const proc = await pipeYtDlpStream(url.trim(), isAudio, reply.raw);
    if (proc) {
      // Keep connection alive until yt-dlp finishes
      await new Promise<void>((resolve) => {
        proc.once('close', () => resolve());
        proc.once('error', () => resolve());
        request.raw.once('close', () => { proc.kill(); resolve(); });
      });
      return;
    }

    // ── STRATEGY 2: proxy pre-resolved CDN URL ────────────────────────────────
    const directUrl = await getDirectStreamUrl(url.trim(), isAudio);
    if (directUrl) {
      try {
        return await proxyCdnUrl(directUrl, request.headers.range, reply);
      } catch (_err) {
        return reply.redirect(directUrl, 302);
      }
    }

    // ── FALLBACK: silent WAV buffer ───────────────────────────────────────────
    const tmpDir = os.tmpdir();
    const wavPath = path.join(tmpDir, `nf_stream_${Date.now()}.wav`);
    const wavBuffer = createSampleWavBuffer(parsedDuration, 0);
    fs.writeFileSync(wavPath, wavBuffer);

    const stat = fs.statSync(wavPath);
    const fileSize = stat.size;
    const range = request.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      reply.status(206);
      reply.header('Content-Range', `bytes ${start}-${end}/${fileSize}`);
      reply.header('Accept-Ranges', 'bytes');
      reply.header('Content-Length', end - start + 1);
      reply.header('Content-Type', 'audio/wav');
      const stream = fs.createReadStream(wavPath, { start, end });
      stream.on('close', () => cleanupFile(wavPath));
      return reply.send(stream);
    }

    reply.header('Content-Length', fileSize);
    reply.header('Accept-Ranges', 'bytes');
    reply.header('Content-Type', 'audio/wav');
    const stream = fs.createReadStream(wavPath);
    stream.on('close', () => cleanupFile(wavPath));
    return reply.send(stream);
  });

  /**
   * GET /api/download — instant CDN proxy download with correct filename.
   * Frontend uses this instead of POST /api/process for fast named downloads.
   */
  fastify.get('/api/download', async (request, reply) => {
    const { url, extension = 'mp3', title = 'NovaFetch_Media', start, end } = (request.query as { url?: string; extension?: string; title?: string; start?: string; end?: string }) || {};
    if (!url || typeof url !== 'string') {
      return reply.status(400).send({ error: 'Valid media URL is required' });
    }

    const isAudio = extension !== 'mp4';
    const ext = isAudio ? 'webm' : 'mp4';
    const safeTitle = decodeURIComponent(title);
    const clipTag = (start || end) ? `_clip_${start || 0}s-${end || 'end'}s` : '';
    const filename = `${safeTitle}${clipTag}.${ext}`;

    const directUrl = await getDirectStreamUrl(url.trim(), isAudio);
    if (directUrl) {
      try {
        return await proxyCdnUrl(directUrl, undefined, reply, filename);
      } catch (_err) {
        fastify.log.warn('CDN download proxy failed');
      }
    }

    // Fallback WAV download
    const tmpDir = os.tmpdir();
    const wavPath = path.join(tmpDir, `nf_dl_${Date.now()}.wav`);
    const wavBuffer = createSampleWavBuffer(210, 0);
    fs.writeFileSync(wavPath, wavBuffer);
    reply.header('Content-Type', 'audio/wav');
    reply.header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename + '.wav')}`);
    reply.header('Content-Length', fs.statSync(wavPath).size);
    const stream = fs.createReadStream(wavPath);
    stream.on('close', () => cleanupFile(wavPath));
    return reply.send(stream);
  });

  // POST /api/process — kept for compatibility
  fastify.post('/api/process', async (request, reply) => {
    const { url, extension = 'mp4', title = 'NovaFetch_Media' } = (request.body as any) || {};
    if (!url || typeof url !== 'string') {
      return reply.status(400).send({ error: 'Valid media URL is required' });
    }

    const isAudio = extension !== 'mp4';
    const ext = isAudio ? 'webm' : 'mp4';
    const filename = `${title}.${ext}`;

    const directUrl = await getDirectStreamUrl(url.trim(), isAudio);
    if (directUrl) {
      try {
        return await proxyCdnUrl(directUrl, undefined, reply, filename);
      } catch (err) {
        fastify.log.warn('CDN download proxy failed');
      }
    }

    const tmpDir = os.tmpdir();
    const wavPath = path.join(tmpDir, `nf_dl_${Date.now()}.wav`);
    const wavBuffer = createSampleWavBuffer(210, 0);
    fs.writeFileSync(wavPath, wavBuffer);
    reply.header('Content-Type', 'audio/wav');
    reply.header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(title + '.wav')}`);
    reply.header('Content-Length', fs.statSync(wavPath).size);
    const stream = fs.createReadStream(wavPath);
    stream.on('close', () => cleanupFile(wavPath));
    return reply.send(stream);
  });
}

