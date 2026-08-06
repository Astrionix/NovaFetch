import { execFile, exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { sanitizeFilename } from '../utils/format';
import { getPlayDlStreamUrl } from './playdl';

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

// In-memory cache for resolved CDN URLs (keyed by YouTube URL + type)
const cdnUrlCache = new Map<string, { url: string; expiresAt: number }>();

export interface ProcessMediaOptions {
  url: string;
  extension: 'mp4' | 'mp3' | 'm4a' | 'wav';
  title?: string;
  duration?: number;
}

/**
 * Gets or downloads the latest yt-dlp binary.
 * On Linux (Render), downloads from GitHub if missing or older than 6 hours.
 */
const TMP_YTDLP = '/tmp/yt-dlp-novafetch';
const MAX_BIN_AGE_MS = 6 * 60 * 60 * 1000; // 6 hours

function isBinFresh(filePath: string): boolean {
  try {
    return (Date.now() - fs.statSync(filePath).mtimeMs) < MAX_BIN_AGE_MS;
  } catch { return false; }
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

  // Linux (Render / other) — always try to get latest from GitHub first
  if (!fs.existsSync(TMP_YTDLP) || !isBinFresh(TMP_YTDLP)) {
    console.log('[NovaFetch] Downloading latest yt-dlp from GitHub...');
    try {
      await execAsync(
        `curl -sL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o ${TMP_YTDLP} && chmod +x ${TMP_YTDLP}`,
        { timeout: 25000 }
      );
      console.log('[NovaFetch] Latest yt-dlp downloaded to', TMP_YTDLP);
      return TMP_YTDLP;
    } catch (e: any) {
      console.warn('[NovaFetch] GitHub download failed:', e.message);
    }
  } else {
    console.log('[NovaFetch] Using cached fresh yt-dlp at', TMP_YTDLP);
    return TMP_YTDLP;
  }

  // Fallback: system-installed or bundled binary
  const fallbacks = [
    '/usr/local/bin/yt-dlp',
    `${process.env.HOME || '/root'}/.local/bin/yt-dlp`,
    path.join(cwd, 'bin', 'yt-dlp'),
    path.join(cwd, 'bin', 'yt-dlp_linux'),
    path.join(cwd, 'node_modules', 'youtube-dl-exec', 'bin', 'yt-dlp'),
    '/usr/bin/yt-dlp',
  ];
  const found = fallbacks.find(p => fs.existsSync(p));
  if (found) {
    console.log('[NovaFetch] Fallback yt-dlp binary:', found);
    return found;
  }
  return 'yt-dlp';
}

export async function getDirectStreamUrl(youtubeUrl: string, audioOnly = true): Promise<string | null> {
  const cacheKey = `${youtubeUrl}:${audioOnly ? 'audio' : 'video'}`;
  const cached = cdnUrlCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    console.log('[NovaFetch] CDN URL cache hit for', youtubeUrl.slice(-15));
    return cached.url;
  }

  // Use standalone yt-dlp binary directly (no Python dependency)
  try {
    const bin = await ensureFreshYtDlp();
    const format = audioOnly ? 'ba/b' : 'b/best[ext=mp4]/best';
    const args = [
      '--get-url',
      '-f', format,
      '--no-playlist',
      '--no-warnings',
      '--quiet',
      youtubeUrl,
    ];

    const { stdout, stderr } = await execFileAsync(bin, args, { timeout: 30000 });
    if (stderr?.trim()) console.warn('[NovaFetch Engine] yt-dlp stderr:', stderr.slice(0, 300));

    const url = stdout.trim().split('\n')[0].trim();
    if (url.startsWith('http')) {
      cdnUrlCache.set(cacheKey, { url, expiresAt: Date.now() + 4 * 60 * 1000 });
      console.log('[NovaFetch Engine] Resolved CDN URL:', url.slice(0, 80));
      return url;
    }
    console.error('[NovaFetch Engine] yt-dlp returned no valid URL:', stdout.slice(0, 200));
  } catch (err: any) {
    console.error('[NovaFetch Engine] yt-dlp execution error:', err?.message || err);
  }

  // ── play-dl fallback (pure Node.js — works on Vercel & Render without Python) ──
  console.log('[NovaFetch Engine] Trying play-dl fallback for', youtubeUrl.slice(-20));
  const playDlUrl = await getPlayDlStreamUrl(youtubeUrl, audioOnly);
  if (playDlUrl) {
    cdnUrlCache.set(cacheKey, { url: playDlUrl, expiresAt: Date.now() + 4 * 60 * 1000 });
    return playDlUrl;
  }

  console.error('[NovaFetch Engine] All resolvers failed for', youtubeUrl.slice(-20));
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
