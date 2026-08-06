import type { VercelRequest, VercelResponse } from '@vercel/node';
import { existsSync, readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

  const result: Record<string, unknown> = {
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
