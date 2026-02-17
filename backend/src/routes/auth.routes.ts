import { FastifyInstance } from 'fastify';
import { AuthController } from '../controllers/auth.controller';
import { registerSchema, loginSchema } from '../controllers/auth.schemas';

export async function authRoutes(server: FastifyInstance) {
    const authController = new AuthController(server);

    server.post('/register', {
        schema: {
            body: registerSchema,
            tags: ['Auth'],
            response: {
                201: {
                    type: 'object',
                    properties: {
                        user: {
                            type: 'object',
                            properties: {
                                id: { type: 'string' },
                                email: { type: 'string' },
                                role: { type: 'string' },
                            },
                        },
                        accessToken: { type: 'string' },
                    },
                },
            },
        },
        handler: authController.register.bind(authController),
    });

    server.post('/login', {
        schema: {
            body: loginSchema,
            tags: ['Auth'],
            response: {
                200: {
                    type: 'object',
                    properties: {
                        user: {
                            type: 'object',
                            properties: {
                                id: { type: 'string' },
                                email: { type: 'string' },
                                role: { type: 'string' },
                            },
                        },
                        accessToken: { type: 'string' },
                    },
                },
            },
        },
        handler: authController.login.bind(authController),
    });

    server.post('/logout', {
        handler: authController.logout.bind(authController)
    });

    server.post('/refresh', {
        handler: authController.refresh.bind(authController)
    });
}
