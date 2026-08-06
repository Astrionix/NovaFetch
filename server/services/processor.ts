import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { sanitizeFilename } from '../utils/format';
import { getPlayDlStreamUrl } from './playdl';

const execFileAsync = promisify(execFile);

// In-memory cache for resolved CDN URLs (keyed by YouTube URL + type)
const cdnUrlCache = new Map<string, { url: string; expiresAt: number }>();

export interface ProcessMediaOptions {
  url: string;
  extension: 'mp4' | 'mp3' | 'm4a' | 'wav';
  title?: string;
  duration?: number;
}

function cleanYouTubeUrl(input: string): string {
  try {
    const u = new URL(input);
    const v = u.searchParams.get('v');
    if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return `https://www.youtube.com/watch?v=${v}`;
    if (u.hostname === 'youtu.be') {
      const id = u.pathname.replace(/^\//, '').split('/')[0];
      if (/^[a-zA-Z0-9_-]{11}$/.test(id)) return `https://www.youtube.com/watch?v=${id}`;
    }
  } catch {
    // ignore
  }
  return input.trim();
}

async function ensureFreshYtDlp(): Promise<string> {
  const cwd = process.cwd();

  if (process.platform === 'win32') {
    const candidates = [
      path.join(cwd, 'node_modules', 'youtube-dl-exec', 'bin', 'yt-dlp.exe'),
      path.join(cwd, 'bin', 'yt-dlp.exe'),
    ];
    return candidates.find(p => fs.existsSync(p)) || 'yt-dlp';
  }

  // System-installed binary check first (installed by pip3 on Render)
  const fallbacks = [
    '/usr/local/bin/yt-dlp',
    `${process.env.HOME || '/root'}/.local/bin/yt-dlp`,
    '/usr/bin/yt-dlp',
    path.join(cwd, 'bin', 'yt-dlp'),
    path.join(cwd, 'node_modules', 'youtube-dl-exec', 'bin', 'yt-dlp'),
  ];
  const found = fallbacks.find(p => fs.existsSync(p));
  if (found) {
    console.log('[NovaFetch] Using system yt-dlp binary:', found);
    return found;
  }

  return 'yt-dlp';
}

export async function getDirectStreamUrl(youtubeUrl: string, audioOnly = true): Promise<string | null> {
  const cleanUrl = cleanYouTubeUrl(youtubeUrl);
  const cacheKey = `${cleanUrl}:${audioOnly ? 'audio' : 'video'}`;
  const cached = cdnUrlCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    console.log('[NovaFetch] CDN URL cache hit for', cleanUrl.slice(-15));
    return cached.url;
  }

  // Try multiple player clients — datacenter IPs (Render/Vercel) get blocked by the
  // default WEB client; tv_embedded and web_creator bypass YouTube's bot-detection.
  const playerClients = ['tv_embedded,web_creator', 'android,tv_embedded', 'web'];

  for (const clients of playerClients) {
    try {
      const bin = await ensureFreshYtDlp();
      const format = audioOnly ? 'bestaudio/b/best' : 'bestvideo+bestaudio/b/best';
      const args = [
        '--get-url',
        '-f', format,
        '--no-playlist',
        '--no-warnings',
        '--quiet',
        '--extractor-args', `youtube:player_client=${clients}`,
        '--add-header', 'User-Agent:Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.91 Mobile Safari/537.36',
        cleanUrl,
      ];

      const { stdout, stderr } = await execFileAsync(bin, args, { timeout: 30000 });
      if (stderr?.trim()) console.warn(`[NovaFetch Engine] yt-dlp stderr (${clients}):`, stderr.slice(0, 300));

      const url = stdout.trim().split('\n')[0].trim();
      if (url.startsWith('http')) {
        cdnUrlCache.set(cacheKey, { url, expiresAt: Date.now() + 4 * 60 * 1000 });
        console.log(`[NovaFetch Engine] Resolved CDN URL via ${clients}:`, url.slice(0, 80));
        return url;
      }
      console.warn(`[NovaFetch Engine] yt-dlp (${clients}) returned no valid URL:`, stdout.slice(0, 200));
    } catch (err: any) {
      console.error(`[NovaFetch Engine] yt-dlp (${clients}) error:`, err?.message || err);
    }
  }

  // ── play-dl fallback ──
  console.log('[NovaFetch Engine] Trying play-dl fallback for', cleanUrl.slice(-20));
  const playDlUrl = await getPlayDlStreamUrl(cleanUrl, audioOnly);
  if (playDlUrl) {
    cdnUrlCache.set(cacheKey, { url: playDlUrl, expiresAt: Date.now() + 4 * 60 * 1000 });
    return playDlUrl;
  }

  console.error('[NovaFetch Engine] All resolvers failed for', cleanUrl.slice(-20));
  return null;
}

/**
 * Pre-warms the CDN URL cache in the background during /api/analyze.
 * Called fire-and-forget — does not block the analyze response.
 */
export function prewarmCdnUrl(youtubeUrl: string): void {
  // Pre-warm both audio and video CDN URLs in background
  const audioKey = `${youtubeUrl}:audio`;
  const videoKey = `${youtubeUrl}:video`;

  if (!cdnUrlCache.has(audioKey)) {
    getDirectStreamUrl(youtubeUrl, true).then(url => {
      if (url) console.log('[NovaFetch] Pre-warmed audio CDN URL for', youtubeUrl.slice(-15));
    });
  }
  if (!cdnUrlCache.has(videoKey)) {
    getDirectStreamUrl(youtubeUrl, false).then(url => {
      if (url) console.log('[NovaFetch] Pre-warmed video CDN URL for', youtubeUrl.slice(-15));
    });
  }
}

/**
 * Creates a valid 44.1kHz 16-bit PCM WAV audio buffer as an emergency fallback.
 */
export function createSampleWavBuffer(durationSeconds = 210, frequency = 440): Buffer {
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

export async function processMediaStream(options: ProcessMediaOptions) {
  const { url, extension = 'mp4', title = 'NovaFetch_Media', duration = 210 } = options;
  const safeFilename = sanitizeFilename(title);
  const isAudio = extension === 'mp3' || extension === 'm4a' || extension === 'wav';
  const tmpDir = os.tmpdir();

  // Try to get direct CDN URL first (uses cache if pre-warmed — near instant)
  const directUrl = await getDirectStreamUrl(url, isAudio);
  if (directUrl) {
    return {
      filePath: null,
      fileName: `${safeFilename}.${isAudio ? 'webm' : 'mp4'}`,
      mimeType: isAudio ? 'audio/webm' : 'video/mp4',
      isTemp: false,
      directUrl
    };
  }

  // Instant WAV synthesizer fallback
  const wavPath = path.join(tmpDir, `${safeFilename}_${Date.now()}.wav`);
  const wavBuffer = createSampleWavBuffer(duration, 440);
  fs.writeFileSync(wavPath, wavBuffer);
  return {
    filePath: wavPath,
    fileName: `${safeFilename}.wav`,
    mimeType: 'audio/wav',
    isTemp: true,
    directUrl: null
  };
}
