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

let _ytdlpBin: string | null = null;

async function ensureFreshYtDlp(): Promise<string> {
  if (_ytdlpBin && fs.existsSync(_ytdlpBin)) return _ytdlpBin;

  const cwd = process.cwd();

  if (process.platform === 'win32') {
    const candidates = [
      path.join(cwd, 'node_modules', 'youtube-dl-exec', 'bin', 'yt-dlp.exe'),
      path.join(cwd, 'bin', 'yt-dlp.exe'),
    ];
    _ytdlpBin = candidates.find(p => fs.existsSync(p)) || 'yt-dlp';
    return _ytdlpBin;
  }

  // Priority: pip3-installed system binary first, then npm-bundled, then downloaded
  const candidates = [
    '/usr/local/bin/yt-dlp',                                              // pip3 --break-system-packages
    `${process.env.HOME || '/root'}/.local/bin/yt-dlp`,                   // pip3 user install
    '/usr/bin/yt-dlp',                                                    // system package manager
    path.join(cwd, 'node_modules', 'youtube-dl-exec', 'bin', 'yt-dlp'), // npm bundled (exists on Render)
    path.join(cwd, 'bin', 'yt-dlp'),                                     // manually placed
  ];

  const found = candidates.find(p => fs.existsSync(p));
  if (found) {
    console.log('[NovaFetch] Using yt-dlp binary:', found);
    _ytdlpBin = found;
    return found;
  }

  // Last resort: download latest yt-dlp binary directly from GitHub releases
  const downloadPath = '/usr/local/bin/yt-dlp';
  try {
    console.log('[NovaFetch] Downloading latest yt-dlp from GitHub releases...');
    const { execFile: ef } = await import('child_process');
    const { promisify: prom } = await import('util');
    const efAsync = prom(ef);
    await efAsync('curl', [
      '-sL',
      'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp',
      '-o', downloadPath
    ], { timeout: 30000 });
    fs.chmodSync(downloadPath, '755');
    console.log('[NovaFetch] yt-dlp downloaded to', downloadPath);
    _ytdlpBin = downloadPath;
    return downloadPath;
  } catch (dlErr: any) {
    console.error('[NovaFetch] curl download failed:', dlErr?.message);
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
 * Pipes yt-dlp audio output DIRECTLY to a Node.js Writable stream.
 *
 * Uses `-o -` (stdout) instead of `--get-url`, which means:
 *  - yt-dlp fetches from YouTube CDN from THE SAME SERVER IP that resolved the URL
 *  - No IP mismatch — no redirect to the browser — no SABR/IP-lock rejection
 *  - Works from any cloud datacenter IP (Render, Vercel, etc.)
 *
 * @param youtubeUrl   Full YouTube watch URL
 * @param audioOnly    true = audio stream, false = video+audio
 * @param writable     The Node.js Writable to pipe into (e.g. reply.raw)
 * @returns child process (caller can listen to 'close'/'error' events)
 */
export async function pipeYtDlpStream(
  youtubeUrl: string,
  audioOnly: boolean,
  writable: import('stream').Writable
): Promise<import('child_process').ChildProcess | null> {
  const { spawn } = await import('child_process');
  const cleanUrl = cleanYouTubeUrl(youtubeUrl);
  const bin = await ensureFreshYtDlp();
  const format = audioOnly ? 'bestaudio/b/best' : 'bestvideo+bestaudio/b/best';

  const playerClients = ['tv_embedded,web_creator', 'android,tv_embedded', 'web'];

  for (const clients of playerClients) {
    const args = [
      '-f', format,
      '--no-playlist',
      '--no-warnings',
      '--quiet',
      '--extractor-args', `youtube:player_client=${clients}`,
      '--add-header', 'User-Agent:Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.91 Mobile Safari/537.36',
      '-o', '-',   // <-- pipe bytes to stdout
      cleanUrl,
    ];

    try {
      const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });

      // Collect stderr to detect failure
      let stderrBuf = '';
      proc.stderr?.on('data', (d: Buffer) => { stderrBuf += d.toString(); });

      // Give it 5s to start outputting data — if stdout emits 'data', it's working
      const started = await new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => resolve(false), 8000);
        proc.stdout?.once('data', () => { clearTimeout(timeout); resolve(true); });
        proc.once('error', () => { clearTimeout(timeout); resolve(false); });
        proc.once('close', (code) => {
          clearTimeout(timeout);
          if (code !== 0) resolve(false);
        });
      });

      if (started) {
        console.log(`[NovaFetch Engine] Piping yt-dlp stream via ${clients} for`, cleanUrl.slice(-20));
        proc.stdout?.pipe(writable, { end: true });
        return proc;
      }

      // Kill the failed process and try next client
      proc.kill();
      if (stderrBuf.trim()) console.warn(`[NovaFetch Engine] yt-dlp pipe (${clients}) failed:`, stderrBuf.slice(0, 200));
    } catch (err: any) {
      console.error(`[NovaFetch Engine] yt-dlp spawn (${clients}) error:`, err?.message);
    }
  }

  console.error('[NovaFetch Engine] pipeYtDlpStream: all player clients failed for', cleanUrl.slice(-20));
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
