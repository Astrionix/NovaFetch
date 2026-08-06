import type { VercelRequest, VercelResponse } from '@vercel/node';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { existsSync, chmodSync, copyFileSync, readdirSync } from 'fs';
import path from 'path';

const execFileAsync = promisify(execFile);

// ── Find the yt-dlp binary ────────────────────────────────────────────────────

function getYtDlpPath(): string {
  // On Linux (Vercel), copy to /tmp once (writable) and cache across warm invocations
  if (process.platform !== 'win32') {
    const tmp = '/tmp/yt-dlp';
    if (existsSync(tmp)) return tmp;

    // Binary could be in several places depending on how Vercel bundles it
    const cwd = process.cwd();
    const dir = __dirname;
    const candidates = [
      path.join(cwd, 'node_modules/youtube-dl-exec/bin/yt-dlp'),
      path.join(dir, '../node_modules/youtube-dl-exec/bin/yt-dlp'),
      path.join(dir, 'node_modules/youtube-dl-exec/bin/yt-dlp'),
      '/var/task/node_modules/youtube-dl-exec/bin/yt-dlp',
      // Also the manually bundled binary
      path.join(cwd, 'bin/yt-dlp_linux'),
      path.join(dir, '../bin/yt-dlp_linux'),
      '/var/task/bin/yt-dlp_linux',
    ];

    const found = candidates.find(p => existsSync(p));
    if (found) {
      copyFileSync(found, tmp);
      chmodSync(tmp, '755');
      console.log('[stream] yt-dlp copied from', found);
      return tmp;
    }

    // Debug: log what actually exists so we can fix the path
    const dirsToCheck = [cwd, dir, '/var/task', '/var/task/node_modules/youtube-dl-exec'];
    for (const d of dirsToCheck) {
      if (existsSync(d)) {
        try {
          const files = readdirSync(d);
          console.log('[stream] ls', d + ':', files.slice(0, 15).join(', '));
        } catch { /* skip */ }
      }
    }

    throw new Error(
      'yt-dlp binary not found. cwd=' + cwd + ' __dirname=' + dir +
      ' Tried: ' + candidates.join(' | ')
    );
  }

  // Windows (local dev) — yt-dlp must be on PATH or use youtube-dl-exec's exe
  const winCandidates = [
    path.join(process.cwd(), 'node_modules/youtube-dl-exec/bin/yt-dlp.exe'),
    path.join(__dirname, '../node_modules/youtube-dl-exec/bin/yt-dlp.exe'),
    'yt-dlp',
  ];
  return winCandidates.find(p => p === 'yt-dlp' || existsSync(p)) ?? 'yt-dlp';
}

// ── Extract audio stream URL via yt-dlp ───────────────────────────────────────

async function getAudioUrl(youtubeUrl: string): Promise<string> {
  const bin = getYtDlpPath();
  console.log('[stream] Using binary:', bin);

  const { stdout, stderr } = await execFileAsync(
    bin,
    [
      '--get-url',
      '-f', 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio',
      '--no-playlist',
      '--no-warnings',
      '--quiet',
      youtubeUrl,
    ],
    { timeout: 25000 }
  );

  if (stderr?.trim()) console.warn('[stream] yt-dlp stderr:', stderr.slice(0, 200));

  const url = stdout.trim().split('\n')[0];
  if (!url?.startsWith('http')) {
    throw new Error('yt-dlp returned no valid URL. stdout=' + stdout.slice(0, 200));
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
    console.log('[stream] Redirecting to CDN');
    // 302 → browser <audio> streams directly from YouTube CDN (no Vercel bandwidth/timeout)
    return res.redirect(302, audioUrl);
  } catch (err) {
    const msg = (err as Error).message;
    console.error('[stream] Failed:', msg);
    return res.status(502).json({ error: 'Could not extract audio stream', detail: msg });
  }
}
