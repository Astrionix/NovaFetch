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

// ── Vercel handler ────────────────────────────────────────────────────────────
//
// Strategy: 302-redirect the browser to Render's /api/stream endpoint.
// Render proxies the audio bytes itself (server → Render → browser).
// This avoids Vercel's 30s streaming timeout AND lets Render's Fastify CORS
// headers reach the browser, solving the cross-origin block.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Accept, Content-Type');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const rawUrl = Array.isArray(req.query.url) ? req.query.url[0] : req.query.url;
  if (!rawUrl) return res.status(400).json({ error: 'url query param required' });

  const extension = Array.isArray(req.query.extension) ? req.query.extension[0] : (req.query.extension || 'mp3');

  const videoId = extractVideoId(rawUrl);
  const youtubeUrl = videoId
    ? `https://www.youtube.com/watch?v=${videoId}`
    : rawUrl;

  // Redirect to Render's /api/stream — Render proxies the bytes with full CORS headers.
  // The browser audio element will stream directly from Render (not from Google CDN).
  const renderStreamUrl = `https://novafetch-c3jm.onrender.com/api/stream?url=${encodeURIComponent(youtubeUrl)}&extension=${encodeURIComponent(extension)}`;
  console.log('[stream] Redirecting to Render proxy stream for:', videoId ?? rawUrl);
  return res.redirect(302, renderStreamUrl);
}
