import type { VercelRequest, VercelResponse } from '@vercel/node';
import { existsSync, readdirSync } from 'fs';
import path from 'path';

/**
 * Debug endpoint - lists key directories so we can find where yt-dlp lands.
 * GET /api/debug
 */
export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const cwd = process.cwd();
  const dir = __dirname;

  const dirsToList = [
    cwd,
    dir,
    '/var/task',
    path.join(cwd, 'bin'),
    path.join(dir, '..', 'bin'),
    path.join(cwd, 'node_modules/youtube-dl-exec'),
    path.join(cwd, 'node_modules/youtube-dl-exec/bin'),
    '/var/task/node_modules/youtube-dl-exec/bin',
  ];

  const result: Record<string, string[] | string> = {
    platform: process.platform,
    cwd,
    __dirname: dir,
  };

  for (const d of dirsToList) {
    if (existsSync(d)) {
      try {
        result[d] = readdirSync(d);
      } catch (e) {
        result[d] = 'ERR: ' + (e as Error).message;
      }
    } else {
      result[d] = 'NOT FOUND';
    }
  }

  return res.status(200).json(result);
}
