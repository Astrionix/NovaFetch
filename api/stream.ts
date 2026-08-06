import type { VercelRequest, VercelResponse } from '@vercel/node';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { existsSync, chmodSync, copyFileSync } from 'fs';
import path from 'path';

const execFileAsync = promisify(execFile);

// ── Find the yt-dlp binary ────────────────────────────────────────────────────
// Verified paths from /api/debug endpoint:
//   __dirname  = /var/task/api
//   cwd        = /var/task
//   Binary at  = /var/task/bin/yt-dlp_linux  (includeFiles: bin/**)
//              = /var/task/node_modules/youtube-dl-exec/bin/yt-dlp  (npm postinstall)

function getYtDlpPath(): string {
  // Windows local dev — use npm-installed exe
  if (process.platform === 'win32') {
    const winBin = path.join(process.cwd(), 'node_modules/youtube-dl-exec/bin/yt-dlp.exe');
    return existsSync(winBin) ? winBin : 'yt-dlp';
  }

  // Linux (Vercel) — cache in /tmp across warm invocations
  const tmp = '/tmp/yt-dlp';
  if (existsSync(tmp)) return tmp;

  // Exact paths confirmed by /api/debug
  const cwd = process.cwd();           // /var/task
  const candidates = [
    cwd + '/node_modules/youtube-dl-exec/bin/yt-dlp',  // /var/task/node_modules/...
    cwd + '/bin/yt-dlp_linux',                          // /var/task/bin/yt-dlp_linux
    '/var/task/node_modules/youtube-dl-exec/bin/yt-dlp',
    '/var/task/bin/yt-dlp_linux',
  ];

  const found = candidates.find(p => existsSync(p));
  if (!found) {
    throw new Error('yt-dlp not found. cwd=' + cwd + ' candidates: ' + candidates.join(', '));
  }

  copyFileSync(found, tmp);
  chmodSync(tmp, '755');
  console.log('[stream] yt-dlp ready from', found);
  return tmp;
}

// ── Extract audio URL via yt-dlp ──────────────────────────────────────────────

async function getAudioUrl(youtubeUrl: string): Promise<string> {
  const bin = getYtDlpPath();

  const { stdout, stderr } = await execFileAsync(bin, [
    '--get-url',
    '-f', 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio',
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
    console.log('[stream] Redirecting to real CDN URL');
    // 302 → browser <audio> streams directly from YouTube CDN
    return res.redirect(302, audioUrl);
  } catch (err) {
    const msg = (err as Error).message;
    console.error('[stream] Error:', msg);
    return res.status(502).json({ error: 'Could not extract audio stream', detail: msg });
  }
}
