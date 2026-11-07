import { FastifyInstance } from 'fastify';
import { AuthController } from '../controllers/auth.controller';
import { registerSchema, loginSchema, googleLoginSchema } from '../controllers/auth.schemas';

export async function authRoutes(server: FastifyInstance) {
    const authController = new AuthController(server);

    server.post('/register', {
        config: {
            rateLimit: {
                max: 10,
                timeWindow: '1 minute'
            }
        },
        schema: {
            body: registerSchema,
            tags: ['Auth'],
        },
        handler: authController.register.bind(authController),
    });

    server.post('/login', {
        config: {
            rateLimit: {
                max: 10,
                timeWindow: '1 minute'
            }
        },
        schema: {
            body: loginSchema,
            tags: ['Auth'],
        },
        handler: authController.login.bind(authController),
    });

    server.post('/google', {
        config: {
            rateLimit: {
                max: 10,
                timeWindow: '1 minute'
            }
        },
        schema: {
            body: googleLoginSchema,
            tags: ['Auth'],
        },
        handler: authController.googleLogin.bind(authController),
    });

    server.post('/guest', {
        config: {
            rateLimit: {
                max: 30,
                timeWindow: '1 minute'
            }
        },
        handler: async (req, reply) => {
            const guestId = `guest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            const guestUser = {
                id: guestId,
                email: `${guestId}@zenify.guest`,
                name: 'Guest Listener',
                isGuest: true,
                role: 'LISTENER' as const,
            };
            const token = server.jwt.sign(guestUser, { expiresIn: '7d' });
            return reply.status(200).send({
                user: guestUser,
                accessToken: token,
                token,
            });
        }
    });

    server.post('/logout', {
        handler: authController.logout.bind(authController)
    });

    server.post('/refresh', {
        config: {
            rateLimit: {
                max: 30,
                timeWindow: '1 minute'
            }
        },
        handler: authController.refresh.bind(authController)
    });

    server.patch('/profile', {
        preHandler: [server.authenticate],
        handler: authController.updateProfile.bind(authController)
    });

    server.post('/avatar', {
        preHandler: [server.authenticate],
        handler: authController.uploadAvatar.bind(authController)
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

    server.patch('/preferences', {
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
        config: {
            rateLimit: {
                max: 5,
                timeWindow: '1 minute'
            }
        },
        handler: authController.requestOTP.bind(authController)
    });

    server.post('/verify-otp', {
        config: {
            rateLimit: {
                max: 10,
                timeWindow: '1 minute'
            }
        },
        handler: authController.verifyOTP.bind(authController)
    });

    server.post('/verify-email', {
        handler: authController.verifyEmail.bind(authController)
    });

    server.post('/reset-password', {
        config: {
            rateLimit: {
                max: 5,
                timeWindow: '1 minute'
            }
        },
        handler: authController.resetPassword.bind(authController)
    });

    server.delete('/account', {
        preHandler: [server.authenticate],
        handler: authController.deleteAccount.bind(authController)
    });

    // Canonical prompt endpoints per 17-AUTH-SETTINGS-INSIGHTS-PROMPT.md
    server.post('/otp/request', {
        config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
        handler: authController.requestOTP.bind(authController)
    });

    server.post('/otp/verify', {
        config: { rateLimit: { max: 15, timeWindow: '1 minute' } },
        handler: authController.verifyOTP.bind(authController)
    });

    server.post('/upgrade', {
        preHandler: [server.authenticate],
        handler: authController.upgrade.bind(authController)
    });

    server.post('/logout-all', {
        preHandler: [server.authenticate],
        handler: authController.logoutAll.bind(authController)
    });

    server.delete('/sessions/:id', {
        preHandler: [server.authenticate],
        handler: authController.revokeSession.bind(authController)
    });

    server.get('/export', {
        preHandler: [server.authenticate],
        handler: authController.exportData.bind(authController)
    });

    server.delete('/identities/google', {
        preHandler: [server.authenticate],
        handler: authController.disconnectGoogle.bind(authController)
    });
}
