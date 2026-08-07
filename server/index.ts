import Fastify from 'fastify';
import cors from '@fastify/cors';
import { mediaRoutes } from './routes/media';

const fastify = Fastify({ logger: true });

// Register CORS with Private Network Access (PNA) header support
await fastify.register(cors, {
  origin: true,
  methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'Range', 'Access-Control-Allow-Private-Network', 'X-Requested-With', 'Accept'],
  exposedHeaders: ['Content-Range', 'Content-Length', 'Content-Disposition', 'Accept-Ranges']
});

// Add Hook for Chrome Private Network Access (PNA) preflight requests and CORS headers
fastify.addHook('onRequest', async (request, reply) => {
  reply.header('Access-Control-Allow-Origin', request.headers.origin || '*');
  reply.header('Access-Control-Allow-Credentials', 'true');
  reply.header('Access-Control-Allow-Private-Network', 'true');
});


// Register Media API Routes
await fastify.register(mediaRoutes);

// Health check endpoint
fastify.get('/api/health', async () => {
  return { status: 'online', engine: 'NovaFetch Fastify Node.js Engine v2.4', timestamp: new Date().toISOString() };
});

// Debug endpoint for diagnostic environment inspection
fastify.get('/api/debug', async () => {
  const { exec } = await import('child_process');
  const { existsSync } = await import('fs');
  const { promisify } = await import('util');
  const path = await import('path');
  const execAsync = promisify(exec);
  const { getDirectStreamUrl } = await import('./services/processor');

  let pythonInfo = 'N/A';
  let ytdlpInfo = 'N/A';
  let pip3Install = 'N/A';
  let whichYtDlp = 'N/A';
  let testStreamResult = 'N/A';

  try { const { stdout } = await execAsync('python3 --version'); pythonInfo = stdout.trim(); } catch (e: any) { pythonInfo = 'ERR: ' + e.message; }
  try { const { stdout } = await execAsync('which yt-dlp 2>/dev/null || echo NOT_FOUND'); whichYtDlp = stdout.trim(); } catch (e: any) { whichYtDlp = 'ERR: ' + e.message; }
  try { const { stdout } = await execAsync('yt-dlp --version 2>&1'); ytdlpInfo = stdout.trim(); } catch (e: any) { ytdlpInfo = 'ERR: ' + e.message; }
  try { const { stdout } = await execAsync('pip3 install -U yt-dlp 2>&1 | tail -3'); pip3Install = stdout.trim(); } catch (e: any) { pip3Install = 'ERR: ' + e.message; }

  const cwd = process.cwd();
  const home = process.env.HOME || '/root';
  const candidates = [
    '/usr/local/bin/yt-dlp',
    `${home}/.local/bin/yt-dlp`,
    path.join(cwd, 'bin', 'yt-dlp'),
    path.join(cwd, 'node_modules', 'youtube-dl-exec', 'bin', 'yt-dlp'),
  ];
  const binStatus: Record<string, boolean> = {};
  for (const c of candidates) binStatus[c] = existsSync(c);

  try {
    const url = await getDirectStreamUrl('https://www.youtube.com/watch?v=CHpq1tGoSEI', true);
    testStreamResult = url ? url.slice(0, 80) + '...' : 'NULL (failed)';
  } catch (e: any) {
    testStreamResult = 'ERR: ' + e.message;
  }

  return { platform: process.platform, cwd, home, pythonInfo, whichYtDlp, pip3Install, ytdlpInfo, binStatus, testStreamResult, timestamp: new Date().toISOString() };
});

// Root API route
fastify.get('/', async () => {
  return {
    status: 'online',
    service: 'NovaFetch Fastify Media API',
    version: '2.4.0',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/api/health',
      analyze: 'POST /api/analyze',
      stream: 'GET /api/stream?url=<youtube_url>',
      download: 'GET /api/download?url=<youtube_url>'
    }
  };
});

// Start Server on Port 3001
const start = async () => {
  try {
    const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
    await fastify.listen({ port, host: '0.0.0.0' });
    console.log(`🚀 NovaFetch Modular Media Backend running at http://0.0.0.0:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
