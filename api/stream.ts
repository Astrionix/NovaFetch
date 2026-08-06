import type { VercelRequest, VercelResponse } from '@vercel/node';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { existsSync, copyFileSync, chmodSync } from 'fs';
import path from 'path';

const execFileAsync = promisify(execFile);

// ── yt-dlp binary setup ──────────────────────────────────────────────────────
// On Vercel (Linux): copy bundled binary to /tmp (writable) at cold start.
// On Windows dev: use local yt-dlp from PATH.

function getYtDlpPath(): string {
  if (process.platform === 'win32') {
    // Local dev — yt-dlp must be on PATH
    return 'yt-dlp';
  }
  // Vercel Linux environment
  const tmpBin = '/tmp/yt-dlp';
  if (!existsSync(tmpBin)) {
    // Bundled binary is at bin/yt-dlp_linux relative to project root
    const bundled = path.join(process.cwd(), 'bin', 'yt-dlp_linux');
    if (existsSync(bundled)) {
      copyFileSync(bundled, tmpBin);
      chmodSync(tmpBin, '755');
      console.log('[stream] Copied yt-dlp binary to /tmp');
    } else {
      throw new Error('yt-dlp binary not found at ' + bundled);
    }
  }
  return tmpBin;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function extractVideoId(input: string): string | null {
  try {
    const u = new URL(input);
    if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null;
    if (u.hostname.includes('youtube.com')) return u.searchParams.get('v');
  } catch { /* not a URL */ }
  const bare = input.match(/^[a-zA-Z0-9_-]{11}$/);
  if (bare) return bare[0];
  return null;
}

async function getAudioUrlViaYtDlp(videoUrl: string): Promise<string> {
  const ytdlp = getYtDlpPath();

  // Get best audio-only stream URL (no video, no ffmpeg merge needed)
  // -f bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio
  const { stdout } = await execFileAsync(ytdlp, [
    '--get-url',
    '-f', 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio',
    '--no-playlist',
    '--no-warnings',
    '--quiet',
    videoUrl,
  ], { timeout: 25000 });

  const url = stdout.trim().split('\n')[0];
  if (!url || !url.startsWith('http')) {
    throw new Error('yt-dlp returned no valid URL');
  }
  return url;
}

// ── Vercel handler ────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Accept, Content-Type');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const rawUrl = Array.isArray(req.query.url) ? req.query.url[0] : req.query.url;
  if (!rawUrl) return res.status(400).json({ error: 'url query param required' });

  const videoId = extractVideoId(rawUrl);
  const videoUrl = videoId
    ? `https://www.youtube.com/watch?v=${videoId}`
    : rawUrl;

  console.log('[stream] Resolving audio via yt-dlp for:', videoId ?? rawUrl);

  try {
    const audioUrl = await getAudioUrlViaYtDlp(videoUrl);
    console.log('[stream] Got CDN URL, redirecting...');

    // 302 redirect — browser <audio> follows it directly to YouTube CDN.
    // This avoids Vercel function timeout/bandwidth limits for the stream itself.
    return res.redirect(302, audioUrl);
  } catch (err) {
    console.error('[stream] yt-dlp failed:', (err as Error).message);
    return res.status(502).json({
      error: 'Could not extract audio stream',
      detail: (err as Error).message,
    });
  }
}
