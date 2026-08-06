import Fastify from 'fastify';
import cors from '@fastify/cors';
import { mediaRoutes } from './routes/media';

const fastify = Fastify({ logger: true });

// Register CORS with Private Network Access (PNA) header support
await fastify.register(cors, {
  origin: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'Range', 'Access-Control-Allow-Private-Network']
});

// Add Hook for Chrome Private Network Access (PNA) preflight requests
fastify.addHook('onRequest', async (request, reply) => {
  reply.header('Access-Control-Allow-Private-Network', 'true');
});

// Register Media API Routes
await fastify.register(mediaRoutes);

// Health check endpoint
fastify.get('/api/health', async () => {
  return { status: 'online', engine: 'NovaFetch Fastify Node.js Engine v2.4', timestamp: new Date().toISOString() };
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
