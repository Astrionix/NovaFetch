import type { VercelRequest, VercelResponse } from '@vercel/node';

const UA_ANDROID = 'com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip';
const UA_BROWSER =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

const PIPED_APIS = [
  'https://pipedapi.kavin.rocks',
  'https://piped-api.garudalinux.org',
  'https://api.piped.projectsegfau.lt',
];

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

type Format = {
  url?: string;
  mimeType?: string;
  bitrate?: number;
  itag?: number;
  signatureCipher?: string;
};

function pickBestAudio(formats: Format[]): Format | null {
  const audio = formats.filter(f => f.mimeType?.includes('audio') && f.url);
  if (!audio.length) return null;
  audio.sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
  return audio.find(f => f.mimeType?.includes('mp4')) ?? audio[0];
}

// ── strategy 1: InnerTube ANDROID (returns direct non-ciphered URLs) ──────────

async function getUrlViaInnerTube(videoId: string): Promise<string | null> {
  try {
    const body = {
      videoId,
      context: {
        client: {
          clientName: 'ANDROID',
          clientVersion: '19.09.37',
          androidSdkVersion: 30,
          hl: 'en',
          gl: 'US',
          utcOffsetMinutes: 0,
        },
      },
    };

    const res = await fetch('https://www.youtube.com/youtubei/v1/player?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': UA_ANDROID,
        'X-YouTube-Client-Name': '3',
        'X-YouTube-Client-Version': '19.09.37',
        'Origin': 'https://www.youtube.com',
        'Referer': 'https://www.youtube.com/',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(9000),
    });

    if (!res.ok) {
      console.warn('[InnerTube] HTTP', res.status);
      return null;
    }

    const data: {
      playabilityStatus?: { status?: string };
      streamingData?: { adaptiveFormats?: Format[]; formats?: Format[] };
    } = await res.json();

    if (data.playabilityStatus?.status !== 'OK') {
      console.warn('[InnerTube] Playability:', data.playabilityStatus?.status);
      return null;
    }

    const all: Format[] = [
      ...(data.streamingData?.adaptiveFormats ?? []),
      ...(data.streamingData?.formats ?? []),
    ];

    const best = pickBestAudio(all);
    console.log('[InnerTube] Best audio:', best?.mimeType, best?.bitrate);
    return best?.url ?? null;
  } catch (e) {
    console.warn('[InnerTube] Error:', (e as Error).message);
    return null;
  }
}

// ── strategy 2: InnerTube TV embedded player (sometimes bypasses cipher) ─────

async function getUrlViaInnerTubeTVEmbed(videoId: string): Promise<string | null> {
  try {
    const body = {
      videoId,
      context: {
        client: {
          clientName: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER',
          clientVersion: '2.0',
          hl: 'en',
          gl: 'US',
          thirdParty: { embedUrl: 'https://www.youtube.com' },
        },
      },
    };

    const res = await fetch('https://www.youtube.com/youtubei/v1/player?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': UA_BROWSER },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return null;
    const data: {
      playabilityStatus?: { status?: string };
      streamingData?: { adaptiveFormats?: Format[]; formats?: Format[] };
    } = await res.json();

    if (data.playabilityStatus?.status !== 'OK') return null;

    const all: Format[] = [
      ...(data.streamingData?.adaptiveFormats ?? []),
      ...(data.streamingData?.formats ?? []),
    ];

    const best = pickBestAudio(all);
    return best?.url ?? null;
  } catch {
    return null;
  }
}

// ── strategy 3: Piped API (open-source YT proxy, has pre-deciphered URLs) ────

async function getUrlViaPiped(videoId: string): Promise<string | null> {
  for (const api of PIPED_APIS) {
    try {
      const res = await fetch(`${api}/streams/${videoId}`, {
        headers: { 'User-Agent': UA_BROWSER },
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) continue;

      const data: { audioStreams?: Array<{ url: string; mimeType: string; bitrate: number }> } =
        await res.json();
      const streams = data.audioStreams ?? [];
      streams.sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
      const mp4 = streams.find(s => s.mimeType?.includes('mp4'));
      const best = mp4 ?? streams[0];
      if (best?.url) {
        console.log('[Piped] Got URL from', api);
        return best.url;
      }
    } catch { /* try next */ }
  }
  return null;
}

// ── strategy 4: scrape ytInitialPlayerResponse for direct (unciphered) URLs ──

async function getUrlViaPageScrape(videoId: string): Promise<string | null> {
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        'User-Agent': UA_BROWSER,
        'Accept-Language': 'en-US,en;q=0.9',
        'Cookie': 'CONSENT=YES+1',
      },
      signal: AbortSignal.timeout(10000),
    });
    const html = await res.text();

    const m = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});\s*(?:var |const |let |if |<\/script)/s);
    if (!m) {
      console.warn('[Scrape] Could not find ytInitialPlayerResponse');
      return null;
    }

    const player: {
      streamingData?: { adaptiveFormats?: Format[]; formats?: Format[] };
    } = JSON.parse(m[1]);

    const all: Format[] = [
      ...(player.streamingData?.adaptiveFormats ?? []),
      ...(player.streamingData?.formats ?? []),
    ];

    const best = pickBestAudio(all);
    if (best?.url) {
      console.log('[Scrape] Got direct URL mimeType:', best.mimeType);
      return best.url;
    }

    console.warn('[Scrape] Only ciphered URLs found');
    return null;
  } catch (e) {
    console.warn('[Scrape] Error:', (e as Error).message);
    return null;
  }
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
  if (!videoId) return res.status(400).json({ error: 'Could not extract video ID' });

  console.log('[stream] Resolving audio for videoId:', videoId);

  // Try strategies in order of reliability
  let audioUrl: string | null = null;

  audioUrl = await getUrlViaInnerTube(videoId);
  if (!audioUrl) audioUrl = await getUrlViaInnerTubeTVEmbed(videoId);
  if (!audioUrl) audioUrl = await getUrlViaPiped(videoId);
  if (!audioUrl) audioUrl = await getUrlViaPageScrape(videoId);

  if (!audioUrl) {
    console.error('[stream] All strategies failed for', videoId);
    return res.status(502).json({ error: 'Could not resolve audio stream for this video' });
  }

  console.log('[stream] Redirecting to real audio CDN');

  // 302 redirect — the browser's <audio> element follows it automatically.
  // The CDN URL is time-limited (~6h) so it's safe to expose temporarily.
  return res.redirect(302, audioUrl);
}
