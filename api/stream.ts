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

  const { extension = 'mp3', duration = '210' } = req.query as { extension?: string; duration?: string };
  const parsedDuration = parseInt(duration || '210', 10) || 210;

  // Synthesize 44.1kHz stereo audio matching exact duration
  const wavBuffer = createSampleWavBuffer(parsedDuration, 440);

  res.setHeader('Content-Type', 'audio/wav');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Length', wavBuffer.length);

  return res.status(200).send(wavBuffer);
}
