import '@fastify/jwt';

declare module '@fastify/jwt' {
    interface FastifyJWT {
        payload: {
            id: string;
            email: string;
            role: 'ADMIN' | 'LISTENER';
        };
        user: {
            id: string;
            email: string;
            role: 'ADMIN' | 'LISTENER';
        };
    }
}
