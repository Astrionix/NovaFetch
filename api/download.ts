import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createSampleWavBuffer } from '../server/services/processor';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Range, Access-Control-Allow-Private-Network'
  );
  res.setHeader('Access-Control-Allow-Private-Network', 'true');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { extension = 'mp3', title = 'NovaFetch_Media', duration = '210' } = req.query as { extension?: string; title?: string; duration?: string };
  const safeTitle = decodeURIComponent(title);
  const parsedDuration = parseInt(duration || '210', 10) || 210;

  const wavBuffer = createSampleWavBuffer(parsedDuration, 440);

  res.setHeader('Content-Type', 'audio/wav');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(safeTitle + '.wav')}`);
  res.setHeader('Content-Length', wavBuffer.length);

  return res.status(200).send(wavBuffer);
}
