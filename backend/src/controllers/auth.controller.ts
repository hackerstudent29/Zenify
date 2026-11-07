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
                maxAge: 60 * 60 // 1 hour access token cookie
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
                maxAge: 60 * 60 // 1 hour access token cookie
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
            const { code, idToken, deviceId, deviceName, platform, appVersion } = req.body;
            const deviceMeta = { deviceId, deviceName, platform, appVersion };
            let result;

            if (idToken) {
                result = await this.authService.verifyGoogleIdToken(idToken, deviceMeta);
            } else if (code) {
                result = await this.authService.verifyGoogleCode(code, deviceMeta);
            } else {
                throw new Error("Either 'code' or 'idToken' is required");
            }

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
                maxAge: 60 * 60 // 1 hour access token cookie
            });

            return reply.send({
                user: result.user,
                accessToken: result.accessToken,
                refreshToken: result.refreshToken,
                sessionId: result.sessionId,
                isNewUser: result.isNewUser
            });
        } catch (error: any) {
            req.log.error({ err: error.message }, 'Google login failed');
            // Explicitly return JSON so CORS headers are always included
            return reply.status(401).send({
                statusCode: 401,
                error: 'Unauthorized',
                message: error.message || 'Google authentication failed'
            });
        }
    }

    logout = async (req: FastifyRequest<{ Body?: { refreshToken?: string, sessionId?: string } }>, reply: FastifyReply) => {
        const refreshToken = req.cookies.refreshToken || req.body?.refreshToken;
        const sessionId = req.body?.sessionId;
        if (refreshToken || sessionId) {
            await this.authService.logout(refreshToken, sessionId);
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

    refresh = async (req: FastifyRequest<{ Body?: { refreshToken?: string } }>, reply: FastifyReply) => {
        const refreshToken = req.cookies.refreshToken || req.body?.refreshToken;
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
                maxAge: 60 * 60 // 1 hour access token cookie
            });

            return reply.send({
                message: 'Refreshed successfully',
                user: result.user,
                accessToken: result.accessToken,
                refreshToken: result.refreshToken
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

    updateProfile = async (req: FastifyRequest<{ Body: { name?: string, username?: string, avatarUrl?: string | null, timezone?: string } }>, reply: FastifyReply) => {
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
        const clientIp = req.ip || req.headers['x-forwarded-for']?.toString();
        const result = await this.authService.requestOTP(req.body.email, clientIp);
        return reply.send(result);
    }

    verifyOTP = async (req: FastifyRequest<{ Body: { email: string, code?: string, otp?: string, deviceId?: string, deviceName?: string, platform?: string, appVersion?: string } }>, reply: FastifyReply) => {
        const code = req.body.code || req.body.otp;
        if (!code) throw reply.server.httpErrors.badRequest('Verification code is required');
        const deviceMeta = {
            deviceId: req.body.deviceId,
            deviceName: req.body.deviceName,
            platform: req.body.platform,
            appVersion: req.body.appVersion
        };
        const result = await this.authService.verifyOTP(req.body.email, code, deviceMeta);

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
            maxAge: 60 * 60
        });

        return reply.send({
            user: result.user,
            accessToken: result.accessToken,
            refreshToken: result.refreshToken,
            sessionId: result.sessionId,
            isNewUser: result.isNewUser
        });
    }

    verifyEmail = async (req: FastifyRequest<{ Body: { email: string, otp: string } }>, reply: FastifyReply) => {
        return this.verifyOTP(req, reply);
    }

    upgrade = async (req: FastifyRequest<{ Body: { guestId?: string } }>, reply: FastifyReply) => {
        // @ts-ignore
        const userId = req.user.id;
        const result = await this.authService.upgradeGuest(userId, req.body.guestId || '');
        return reply.send(result);
    }

    logoutAll = async (req: FastifyRequest, reply: FastifyReply) => {
        // @ts-ignore
        const userId = req.user.id;
        const result = await this.authService.logoutAll(userId);

        const cookieOptions = {
            path: '/',
            httpOnly: true,
            secure: config.NODE_ENV === 'production',
            sameSite: (config.NODE_ENV === 'production' ? 'none' : 'lax') as any,
        };
        reply.clearCookie('refreshToken', cookieOptions);
        reply.clearCookie('accessToken', cookieOptions);

        return reply.send(result);
    }

    revokeSession = async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        // @ts-ignore
        const userId = req.user.id;
        const result = await this.authService.revokeSession(userId, req.params.id);
        return reply.send(result);
    }

    exportData = async (req: FastifyRequest, reply: FastifyReply) => {
        // @ts-ignore
        const userId = req.user.id;
        const result = await this.authService.exportUserData(userId);
        return reply.send(result);
    }

    disconnectGoogle = async (req: FastifyRequest, reply: FastifyReply) => {
        // @ts-ignore
        const userId = req.user.id;
        const result = await this.authService.disconnectGoogle(userId);
        return reply.send(result);
    }
}
