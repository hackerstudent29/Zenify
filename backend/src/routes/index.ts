import { FastifyInstance } from 'fastify';

async function routes(server: FastifyInstance) {
    server.get('/', async (request, reply) => {
        return { hello: 'world' };
    });
}

export default routes;
