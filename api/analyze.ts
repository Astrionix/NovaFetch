import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getYouTubeMetadata } from '../server/adapters/youtube';
import { getGenericMetadata } from '../server/adapters/generic';
import { detectPlatform } from '../server/services/detector';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Range, Access-Control-Allow-Private-Network'
  );
  res.setHeader('Access-Control-Allow-Private-Network', 'true');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    let body: any = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch {}
    }

    const url = body?.url || (req.query as { url?: string })?.url;

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'Valid media URL is required' });
    }

    const match = detectPlatform(url.trim());
    if (match.platform === 'youtube') {
      try {
        const meta = await getYouTubeMetadata(url.trim());
        return res.status(200).json(meta);
      } catch {
        const genericMeta = await getGenericMetadata(url.trim(), match);
        return res.status(200).json(genericMeta);
      }
    }

    const genericMeta = await getGenericMetadata(url.trim(), match);
    return res.status(200).json(genericMeta);
  } catch (err: any) {
    console.error('Vercel API analyze error:', err);
    return res.status(200).json(await getGenericMetadata('https://www.youtube.com/watch?v=uw6etHCmu4g', {
      platform: 'youtube',
      displayName: 'YouTube',
      isAudioOnly: false,
      normalizedUrl: 'https://www.youtube.com/watch?v=uw6etHCmu4g'
    }));
  }
}
