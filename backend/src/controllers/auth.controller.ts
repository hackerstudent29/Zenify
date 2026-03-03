import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AuthService } from '../services/auth.service';
import { RegisterInput, LoginInput, GoogleLoginInput } from './auth.schemas';
import { config } from '../config/env';

export class AuthController {
    private authService: AuthService;

    constructor(server: FastifyInstance) {
        this.authService = new AuthService(server);
    }

    register = async (req: FastifyRequest<{ Body: RegisterInput }>, reply: FastifyReply) => {
        try {
            const result = await this.authService.register(req.body);

            if (result.requiresVerification) {
                return reply.status(201).send({
                    message: result.message,
                    requiresVerification: true,
                    email: result.email
                });
            }

            // Normal flow if we ever disable verification
            reply.setCookie('refreshToken', result.refreshToken!, {
                path: '/',
                httpOnly: true,
                secure: config.NODE_ENV === 'production',
                sameSite: config.NODE_ENV === 'production' ? 'none' : 'lax',
                maxAge: 30 * 24 * 60 * 60
            });

            reply.setCookie('accessToken', result.accessToken!, {
                path: '/',
                httpOnly: true,
                secure: config.NODE_ENV === 'production',
                sameSite: config.NODE_ENV === 'production' ? 'none' : 'lax',
                maxAge: 30 * 24 * 60 * 60
            });

            return reply.status(201).send({
                user: result.user,
                accessToken: result.accessToken
            });
        } catch (error) {
            req.log.error(error);
            throw error;
        }
    }

    login = async (req: FastifyRequest<{ Body: LoginInput }>, reply: FastifyReply) => {
        try {
            const result = await this.authService.login(req.body);

            reply.setCookie('refreshToken', result.refreshToken, {
                path: '/',
                httpOnly: true,
                secure: config.NODE_ENV === 'production',
                sameSite: config.NODE_ENV === 'production' ? 'none' : 'lax',
                maxAge: 30 * 24 * 60 * 60
            });

            reply.setCookie('accessToken', result.accessToken, {
                path: '/',
                httpOnly: true,
                secure: config.NODE_ENV === 'production',
                sameSite: config.NODE_ENV === 'production' ? 'none' : 'lax',
                maxAge: 30 * 24 * 60 * 60
            });

            return reply.send({
                user: result.user,
                accessToken: result.accessToken
            });
        } catch (error) {
            req.log.error(error);
            throw error;
        }
    }

    googleLogin = async (req: FastifyRequest<{ Body: GoogleLoginInput }>, reply: FastifyReply) => {
        try {
            const result = await this.authService.verifyGoogleCode(req.body.code);

            reply.setCookie('refreshToken', result.refreshToken, {
                path: '/',
                httpOnly: true,
                secure: config.NODE_ENV === 'production',
                sameSite: config.NODE_ENV === 'production' ? 'none' : 'lax',
                maxAge: 30 * 24 * 60 * 60
            });

            reply.setCookie('accessToken', result.accessToken, {
                path: '/',
                httpOnly: true,
                secure: config.NODE_ENV === 'production',
                sameSite: config.NODE_ENV === 'production' ? 'none' : 'lax',
                maxAge: 30 * 24 * 60 * 60
            });

            return reply.send({
                user: result.user,
                accessToken: result.accessToken
            });
        } catch (error) {
            req.log.error(error);
            throw error;
        }
    }

    logout = async (req: FastifyRequest, reply: FastifyReply) => {
        const refreshToken = req.cookies.refreshToken;
        if (refreshToken) {
            await this.authService.logout(refreshToken);
        }

        const cookieOptions = {
            path: '/',
            httpOnly: true,
            secure: config.NODE_ENV === 'production',
            sameSite: (config.NODE_ENV === 'production' ? 'none' : 'lax') as any,
        };

        reply.clearCookie('refreshToken', cookieOptions);
        reply.clearCookie('accessToken', cookieOptions);

        return reply.send({ message: 'Logged out successfully' });
    }

    refresh = async (req: FastifyRequest, reply: FastifyReply) => {
        const refreshToken = req.cookies.refreshToken;
        if (!refreshToken) {
            throw reply.server.httpErrors.unauthorized('No refresh token provided');
        }

        try {
            const result = await this.authService.refresh(refreshToken);

            reply.setCookie('refreshToken', result.refreshToken, {
                path: '/',
                httpOnly: true,
                secure: config.NODE_ENV === 'production',
                sameSite: config.NODE_ENV === 'production' ? 'none' : 'lax',
                maxAge: 30 * 24 * 60 * 60
            });

            reply.setCookie('accessToken', result.accessToken, {
                path: '/',
                httpOnly: true,
                secure: config.NODE_ENV === 'production',
                sameSite: config.NODE_ENV === 'production' ? 'none' : 'lax',
                maxAge: 30 * 24 * 60 * 60
            });

            return reply.send({
                message: 'Refreshed successfully',
                user: result.user,
                accessToken: result.accessToken
            });
        } catch (error) {
            const cookieOptions = {
                path: '/',
                httpOnly: true,
                secure: config.NODE_ENV === 'production',
                sameSite: (config.NODE_ENV === 'production' ? 'none' : 'lax') as any,
            };
            reply.clearCookie('refreshToken', cookieOptions);
            reply.clearCookie('accessToken', cookieOptions);
            throw error;
        }
    }

    updateProfile = async (req: FastifyRequest<{ Body: { name: string, username: string } }>, reply: FastifyReply) => {
        // @ts-ignore
        const userId = req.user.id;
        const result = await this.authService.updateProfile(userId, req.body);
        return reply.send(result);
    }

    uploadAvatar = async (req: FastifyRequest, reply: FastifyReply) => {
        // @ts-ignore
        const userId = req.user.id;
        const parts = req.parts();
        const result = await this.authService.uploadAvatar(userId, parts);
        return reply.send(result);
    }

    getProfile = async (req: FastifyRequest, reply: FastifyReply) => {
        // @ts-ignore - user attached by auth middleware
        const userId = req.user.id;
        const user = await this.authService.getProfile(userId);
        return reply.send(user);
    }

    updatePassword = async (req: FastifyRequest<{ Body: any }>, reply: FastifyReply) => {
        // @ts-ignore
        const userId = req.user.id;
        const result = await this.authService.updatePassword(userId, req.body);
        return reply.send(result);
    }
    updatePreferences = async (req: FastifyRequest<{ Body: any }>, reply: FastifyReply) => {
        // @ts-ignore
        const userId = req.user.id;
        req.log.info({ body: req.body, userId }, "Updating preferences");
        const result = await this.authService.updatePreferences(userId, req.body);
        return reply.send(result);
    }

    resetPassword = async (req: FastifyRequest<{ Body: any }>, reply: FastifyReply) => {
        const result = await this.authService.resetPassword(req.body);
        return reply.send(result);
    }

    deleteAccount = async (req: FastifyRequest, reply: FastifyReply) => {
        // @ts-ignore
        const userId = req.user.id;
        const result = await this.authService.deleteAccount(userId);

        reply.clearCookie('refreshToken', { path: '/' });
        reply.clearCookie('accessToken', { path: '/' });

        return reply.send(result);
    }

    getSessions = async (req: FastifyRequest, reply: FastifyReply) => {
        // @ts-ignore
        const userId = req.user.id;
        const result = await this.authService.getSessions(userId);
        return reply.send(result);
    }

    getSubscription = async (req: FastifyRequest, reply: FastifyReply) => {
        // @ts-ignore
        const userId = req.user.id;
        const result = await this.authService.getSubscription(userId);
        return reply.send(result);
    }

    requestOTP = async (req: FastifyRequest<{ Body: { email: string } }>, reply: FastifyReply) => {
        const result = await this.authService.requestOTP(req.body.email);
        return reply.send(result);
    }

    verifyOTP = async (req: FastifyRequest<{ Body: { email: string, otp: string } }>, reply: FastifyReply) => {
        const result = await this.authService.verifyOTP(req.body.email, req.body.otp);
        return reply.send(result);
    }

    verifyEmail = async (req: FastifyRequest<{ Body: { email: string, otp: string } }>, reply: FastifyReply) => {
        try {
            const result = await this.authService.verifyEmail(req.body.email, req.body.otp);

            reply.setCookie('refreshToken', result.refreshToken, {
                path: '/',
                httpOnly: true,
                secure: config.NODE_ENV === 'production',
                sameSite: config.NODE_ENV === 'production' ? 'none' : 'lax',
                maxAge: 30 * 24 * 60 * 60
            });

            reply.setCookie('accessToken', result.accessToken, {
                path: '/',
                httpOnly: true,
                secure: config.NODE_ENV === 'production',
                sameSite: config.NODE_ENV === 'production' ? 'none' : 'lax',
                maxAge: 30 * 24 * 60 * 60
            });

            return reply.send({
                user: result.user,
                accessToken: result.accessToken
            });
        } catch (error) {
            req.log.error(error);
            throw error;
        }
    }
}
