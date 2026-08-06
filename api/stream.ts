import type { VercelRequest, VercelResponse } from '@vercel/node';
import { execFile, exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, chmodSync, copyFileSync, statSync } from 'fs';
import path from 'path';

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

// ── yt-dlp binary management ─────────────────────────────────────────────────
// The bundled yt-dlp in node_modules gets stale (YouTube changes cipher monthly).
// We download the latest release from GitHub on each cold start if needed.

const TMP_YTDLP = '/tmp/yt-dlp';
const MAX_AGE_MS = 6 * 60 * 60 * 1000; // re-download after 6 hours

function isFreshEnough(filePath: string): boolean {
  try {
    const st = statSync(filePath);
    return (Date.now() - st.mtimeMs) < MAX_AGE_MS;
  } catch {
    return false;
  }
}

async function ensureFreshYtDlp(): Promise<string> {
  // Windows local dev — use npm-installed exe
  if (process.platform === 'win32') {
    const winBin = path.join(process.cwd(), 'node_modules/youtube-dl-exec/bin/yt-dlp.exe');
    return existsSync(winBin) ? winBin : 'yt-dlp';
  }

  // Linux (Vercel) — try to download the LATEST yt-dlp from GitHub
  if (!existsSync(TMP_YTDLP) || !isFreshEnough(TMP_YTDLP)) {
    console.log('[stream] Downloading latest yt-dlp from GitHub...');
    try {
      await execAsync(
        `curl -sL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux -o ${TMP_YTDLP} && chmod +x ${TMP_YTDLP}`,
        { timeout: 20000 }
      );
      console.log('[stream] yt-dlp downloaded and ready');
      return TMP_YTDLP;
    } catch (e: any) {
      console.warn('[stream] GitHub download failed:', e.message);
    }

    // Fall back to bundled binary (might be stale but better than nothing)
    const cwd = process.cwd();
    const candidates = [
      cwd + '/node_modules/youtube-dl-exec/bin/yt-dlp',
      cwd + '/bin/yt-dlp_linux',
      '/var/task/node_modules/youtube-dl-exec/bin/yt-dlp',
      '/var/task/bin/yt-dlp_linux',
    ];
    const found = candidates.find(p => existsSync(p));
    if (found) {
      copyFileSync(found, TMP_YTDLP);
      chmodSync(TMP_YTDLP, '755');
      console.log('[stream] Using bundled yt-dlp from', found);
    } else {
      throw new Error('yt-dlp not found anywhere');
    }
  }

  return TMP_YTDLP;
}

// ── Extract audio URL via yt-dlp ──────────────────────────────────────────────

async function getAudioUrl(youtubeUrl: string): Promise<string> {
  const bin = await ensureFreshYtDlp();

  const { stdout, stderr } = await execFileAsync(bin, [
    '--get-url',
    '-f', 'ba/b',
    '--extractor-args', 'youtube:player_client=ios,web,mweb',
    '--no-playlist',
    '--no-warnings',
    '--quiet',
    youtubeUrl,
  ], { timeout: 25000 });

  if (stderr?.trim()) console.warn('[stream] yt-dlp stderr:', stderr.slice(0, 300));

  const url = stdout.trim().split('\n')[0];
  if (!url?.startsWith('http')) {
    throw new Error('yt-dlp returned no valid URL: ' + stdout.slice(0, 200));
  }
  return url;
}

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
  const youtubeUrl = videoId
    ? `https://www.youtube.com/watch?v=${videoId}`
    : rawUrl;

  console.log('[stream] Resolving audio for:', videoId ?? rawUrl);

  try {
    const audioUrl = await getAudioUrl(youtubeUrl);
    console.log('[stream] Redirecting to real CDN URL (yt-dlp)');
    return res.redirect(302, audioUrl);
  } catch (err) {
    const msg = (err as Error).message;
    console.warn('[stream] yt-dlp failed:', msg.slice(0, 200));
  }

  // Final fallback — delegate to Render engine (has Python + latest yt-dlp)
  console.warn('[stream] All local resolvers failed, delegating to Render engine');
  const renderStreamUrl = `https://novafetch-c3jm.onrender.com/api/stream?url=${encodeURIComponent(youtubeUrl)}`;
  return res.redirect(302, renderStreamUrl);
}
