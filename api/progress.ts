import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  let current = 0;
  const interval = setInterval(() => {
    current += Math.floor(Math.random() * 20 + 15);
    if (current > 100) current = 100;
    res.write(`data: ${JSON.stringify({ progress: current, status: current === 100 ? 'done' : 'processing' })}\n\n`);
    if (current >= 100) {
      clearInterval(interval);
      res.end();
    }
  }, 200);

  req.on('close', () => {
    clearInterval(interval);
  });
}
