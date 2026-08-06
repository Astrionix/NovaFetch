import type { VercelRequest, VercelResponse } from '@vercel/node';
import youtubeDlExec from 'youtube-dl-exec';

// ── helpers ───────────────────────────────────────────────────────────────────

function extractVideoId(input: string): string | null {
  try {
    const u = new URL(input);
    if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null;
    if (u.hostname.includes('youtube.com')) return u.searchParams.get('v');
  } catch { /* not a URL — fall through */ }
  if (/^[a-zA-Z0-9_-]{11}$/.test(input)) return input;
  return null;
}

async function getAudioUrl(youtubeUrl: string): Promise<string> {
  // youtube-dl-exec auto-manages the platform-correct yt-dlp binary.
  // On Vercel (Linux), the postinstall step downloads yt-dlp_linux into node_modules.
  const result = await youtubeDlExec(youtubeUrl, {
    getUrl: true,
    format: 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio',
    noPlaylist: true,
    noWarnings: true,
    quiet: true,
  }, { timeout: 25000 });

  const url = (result as string).trim().split('\n')[0];
  if (!url || !url.startsWith('http')) {
    throw new Error('yt-dlp returned no valid URL: ' + String(result).slice(0, 200));
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
  const youtubeUrl = videoId
    ? `https://www.youtube.com/watch?v=${videoId}`
    : rawUrl;

  console.log('[stream] Resolving audio for:', videoId ?? rawUrl);

  try {
    const audioUrl = await getAudioUrl(youtubeUrl);
    console.log('[stream] Redirecting to CDN URL');

    // 302 redirect → browser <audio> element streams directly from YouTube CDN.
    // Avoids routing the entire audio through Vercel (bandwidth + timeout limits).
    return res.redirect(302, audioUrl);
  } catch (err) {
    console.error('[stream] Failed:', (err as Error).message);
    return res.status(502).json({
      error: 'Could not extract audio stream',
      detail: (err as Error).message,
    });
  }
}
