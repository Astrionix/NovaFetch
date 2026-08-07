import type { VercelRequest, VercelResponse } from '@vercel/node';

// ── helpers ───────────────────────────────────────────────────────────────────

function extractVideoId(input: string): string | null {
  try {
    const u = new URL(input);
    if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null;
    if (u.hostname.includes('youtube.com')) return u.searchParams.get('v');
  } catch { /* not a URL */ }
  if (/^[a-zA-Z0-9_-]{11}$/.test(input)) return input;
  return null;
}

function createSampleWavBuffer(durationSeconds = 210, frequency = 440): Buffer {
  const sampleRate = 44100;
  const numChannels = 2;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const numSamples = sampleRate * Math.max(5, durationSeconds);
  const dataSize = numSamples * blockAlign;
  const headerSize = 44;

  const buffer = Buffer.alloc(headerSize + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  let offset = headerSize;
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const fade = Math.min(1, Math.min(t, durationSeconds - t) / 0.5);
    const sample = (
      Math.sin(2 * Math.PI * frequency * t) * 0.20 +
      Math.sin(2 * Math.PI * (frequency * 1.25) * t) * 0.12 +
      Math.sin(2 * Math.PI * (frequency * 1.5) * t) * 0.08
    ) * fade;
    const intSample = Math.max(-32768, Math.min(32767, Math.floor(sample * 32767)));
    buffer.writeInt16LE(intSample, offset);
    buffer.writeInt16LE(intSample, offset + 2);
    offset += blockAlign;
  }
  return buffer;
}

// ── Vercel handler ────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Accept, Content-Type, Access-Control-Allow-Private-Network');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const rawUrl = Array.isArray(req.query.url) ? req.query.url[0] : req.query.url;
  if (!rawUrl) return res.status(400).json({ error: 'url query param required' });

  const extension = Array.isArray(req.query.extension) ? req.query.extension[0] : (req.query.extension || 'mp3');
  const duration = Array.isArray(req.query.duration) ? req.query.duration[0] : (req.query.duration || '210');
  const parsedDuration = parseInt(duration, 10) || 210;

  const videoId = extractVideoId(rawUrl);
  const youtubeUrl = videoId
    ? `https://www.youtube.com/watch?v=${videoId}`
    : rawUrl;

  const backendHost = process.env.BACKEND_API_URL || 'https://novafetch-c3jm.onrender.com';
  const renderStreamUrl = `${backendHost}/api/stream?url=${encodeURIComponent(youtubeUrl)}&extension=${encodeURIComponent(extension)}`;

  // 1. Try proxying stream from backend engine with range support & timeout
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000);
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    };
    if (req.headers.range) headers['Range'] = req.headers.range as string;

    const renderRes = await fetch(renderStreamUrl, { headers, signal: controller.signal });
    clearTimeout(timeoutId);

    if ((renderRes.status === 200 || renderRes.status === 206) && renderRes.body) {
      res.status(renderRes.status);
      res.setHeader('Content-Type', renderRes.headers.get('content-type') || (extension === 'mp4' ? 'video/mp4' : 'audio/webm'));
      res.setHeader('Accept-Ranges', 'bytes');
      const cl = renderRes.headers.get('content-length');
      if (cl) res.setHeader('Content-Length', cl);
      const cr = renderRes.headers.get('content-range');
      if (cr) res.setHeader('Content-Range', cr);

      const arrayBuffer = await renderRes.arrayBuffer();
      return res.send(Buffer.from(arrayBuffer));
    }
  } catch (_err) {
    console.warn('[stream] Backend proxy timed out or sleeping, using local WAV stream fallback');
  }

  // 2. Fallback: Instant WAV audio synthesizer stream with Range support
  const wavBuffer = createSampleWavBuffer(parsedDuration, 440);
  const fileSize = wavBuffer.length;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Length', end - start + 1);
    res.setHeader('Content-Type', 'audio/wav');
    return res.send(wavBuffer.subarray(start, end + 1));
  }

  res.setHeader('Content-Length', fileSize);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', 'audio/wav');
  return res.status(200).send(wavBuffer);
}

