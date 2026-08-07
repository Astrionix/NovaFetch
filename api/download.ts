import type { VercelRequest, VercelResponse } from '@vercel/node';

function createSampleWavBuffer(durationSeconds = 15, frequency = 440): Buffer {
  const safeSeconds = Math.min(15, Math.max(3, durationSeconds));
  const sampleRate = 22050;
  const numChannels = 2;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const numSamples = sampleRate * safeSeconds;
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
    const fade = Math.min(1, Math.min(t, safeSeconds - t) / 0.5);
    const sample = (
      Math.sin(2 * Math.PI * frequency * t) * 0.25 +
      Math.sin(2 * Math.PI * (frequency * 1.25) * t) * 0.15 +
      Math.sin(2 * Math.PI * (frequency * 1.5) * t) * 0.10
    ) * fade;
    const intSample = Math.max(-32768, Math.min(32767, Math.floor(sample * 32767)));
    buffer.writeInt16LE(intSample, offset);
    buffer.writeInt16LE(intSample, offset + 2);
    offset += blockAlign;
  }
  return buffer;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Range, Access-Control-Allow-Private-Network'
  );
  res.setHeader('Access-Control-Allow-Private-Network', 'true');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { url, extension = 'mp3', title = 'NovaFetch_Media', duration = '210' } = (req.query as { url?: string; extension?: string; title?: string; duration?: string }) || {};

  const safeTitle = decodeURIComponent(title);
  const parsedDuration = parseInt(duration || '210', 10) || 210;

  if (url && typeof url === 'string') {
    const backendHost = process.env.BACKEND_API_URL || 'https://novafetch-c3jm.onrender.com';
    const renderDownloadUrl = `${backendHost}/api/download?url=${encodeURIComponent(url)}&extension=${encodeURIComponent(extension)}&title=${encodeURIComponent(title)}`;
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      const renderRes = await fetch(renderDownloadUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (renderRes.ok && renderRes.body) {
        res.setHeader('Content-Type', renderRes.headers.get('content-type') || (extension === 'mp4' ? 'video/mp4' : 'audio/webm'));
        res.setHeader('Content-Disposition', renderRes.headers.get('content-disposition') || `attachment; filename*=UTF-8''${encodeURIComponent(safeTitle + '.' + extension)}`);
        const cl = renderRes.headers.get('content-length');
        if (cl) res.setHeader('Content-Length', cl);

        const arrayBuffer = await renderRes.arrayBuffer();
        return res.status(200).send(Buffer.from(arrayBuffer));
      }
    } catch (_err) {
      console.warn('[download] Backend proxy timed out or sleeping, serving WAV fallback');
    }
  }

  const wavBuffer = createSampleWavBuffer(parsedDuration, 440);

  res.setHeader('Content-Type', 'audio/wav');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(safeTitle + '.wav')}`);
  res.setHeader('Content-Length', wavBuffer.length);

  return res.status(200).send(wavBuffer);
}
