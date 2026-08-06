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

// Start Server on Port 3001
const start = async () => {
  try {
    await fastify.listen({ port: 3001, host: '0.0.0.0' });
    console.log('🚀 NovaFetch Modular Media Backend running at http://localhost:3001');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
