import fastify from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import jwt from '@fastify/jwt';
import cookie from '@fastify/cookie';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { config } from './config/env';

const server = fastify({
    logger: {
        transport: {
            target: 'pino-pretty',
            options: {
                translateTime: 'HH:MM:ss Z',
                ignore: 'pid,hostname',
            },
        },
    },
}).withTypeProvider<ZodTypeProvider>();

server.setValidatorCompiler(validatorCompiler);
server.setSerializerCompiler(serializerCompiler);

server.register(cors, {
    origin: true, // Allow all for dev, restrict in prod
    credentials: true, // Important for cookies
});

server.register(sensible);

server.register(cookie);

server.register(jwt, {
    secret: config.JWT_SECRET,
});

import { authRoutes } from './routes/auth.routes';
import { trackRoutes } from './routes/track.routes';
import { searchRoutes } from './routes/search.routes';
import { playlistRoutes } from './routes/playlist.routes';
import { authMiddleware } from './middleware/auth';

server.register(authMiddleware);

server.register(authRoutes, { prefix: '/api/auth' });
server.register(trackRoutes, { prefix: '/api/tracks' });
server.register(searchRoutes, { prefix: '/api/search' });
server.register(playlistRoutes, { prefix: '/api/playlists' });

server.get('/health', async () => {
    return { status: 'ok' };
});

server.get('/', async () => {
    return { message: 'Zenify API is running 🎵', documentation: '/documentation' };
});

const start = async () => {
    try {
        await server.listen({ port: config.PORT, host: '0.0.0.0' });
        server.log.info(`Server listening on port ${config.PORT}`);
    } catch (err) {
        server.log.error(err);
        process.exit(1);
    }
};

start();
