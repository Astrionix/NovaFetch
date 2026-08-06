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

  const { url } = (req.body as { url?: string }) || (req.query as { url?: string }) || {};

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Valid media URL is required' });
  }

  try {
    const match = detectPlatform(url.trim());
    if (match.platform === 'youtube') {
      const meta = await getYouTubeMetadata(url.trim());
      return res.status(200).json(meta);
    }
    const genericMeta = await getGenericMetadata(url.trim(), match);
    return res.status(200).json(genericMeta);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Media analysis failed' });
  }
}
