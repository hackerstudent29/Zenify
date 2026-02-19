import { FastifyInstance } from 'fastify';
import { AuthController } from '../controllers/auth.controller';
import { registerSchema, loginSchema, googleLoginSchema } from '../controllers/auth.schemas';

export async function authRoutes(server: FastifyInstance) {
    const authController = new AuthController(server);

    server.post('/register', {
        schema: {
            body: registerSchema,
            tags: ['Auth'],
        },
        handler: authController.register.bind(authController),
    });

    server.post('/login', {
        schema: {
            body: loginSchema,
            tags: ['Auth'],
        },
        handler: authController.login.bind(authController),
    });

    server.post('/google', {
        schema: {
            body: googleLoginSchema,
            tags: ['Auth'],
        },
        handler: authController.googleLogin.bind(authController),
    });

    server.post('/logout', {
        handler: authController.logout.bind(authController)
    });

    server.post('/refresh', {
        handler: authController.refresh.bind(authController)
    });

    server.get('/me', {
        preHandler: [server.authenticate],
        handler: authController.getProfile.bind(authController)
    });

    server.put('/password', {
        preHandler: [server.authenticate],
        handler: authController.updatePassword.bind(authController)
    });

    server.put('/preferences', {
        preHandler: [server.authenticate],
        handler: authController.updatePreferences.bind(authController)
    });

    server.get('/sessions', {
        preHandler: [server.authenticate],
        handler: authController.getSessions.bind(authController)
    });

    server.get('/subscription', {
        preHandler: [server.authenticate],
        handler: authController.getSubscription.bind(authController)
    });

    server.post('/request-otp', {
        handler: authController.requestOTP.bind(authController)
    });

    server.post('/verify-otp', {
        handler: authController.verifyOTP.bind(authController)
    });

    server.post('/reset-password', {
        handler: authController.resetPassword.bind(authController)
    });
}
