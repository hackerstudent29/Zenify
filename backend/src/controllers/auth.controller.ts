import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AuthService } from '../services/auth.service';
import { RegisterInput, LoginInput, GoogleLoginInput } from './auth.schemas';

export class AuthController {
    private authService: AuthService;

    constructor(server: FastifyInstance) {
        this.authService = new AuthService(server);
    }

    register = async (req: FastifyRequest<{ Body: RegisterInput }>, reply: FastifyReply) => {
        const result = await this.authService.register(req.body);

        reply.setCookie('refreshToken', result.refreshToken, {
            path: '/',
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60 // 7 days
        });

        reply.setCookie('accessToken', result.accessToken, {
            path: '/',
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 15 * 60 // 15 mins
        });

        return reply.status(201).send({
            user: result.user,
            accessToken: result.accessToken
        });
    }

    login = async (req: FastifyRequest<{ Body: LoginInput }>, reply: FastifyReply) => {
        const result = await this.authService.login(req.body);

        reply.setCookie('refreshToken', result.refreshToken, {
            path: '/',
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60
        });

        reply.setCookie('accessToken', result.accessToken, {
            path: '/',
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 15 * 60
        });

        return reply.send({
            user: result.user,
            accessToken: result.accessToken
        });
    }

    googleLogin = async (req: FastifyRequest<{ Body: GoogleLoginInput }>, reply: FastifyReply) => {
        const result = await this.authService.verifyGoogleCode(req.body.code);

        reply.setCookie('refreshToken', result.refreshToken, {
            path: '/',
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60
        });

        reply.setCookie('accessToken', result.accessToken, {
            path: '/',
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 15 * 60
        });

        return reply.send({
            user: result.user,
            accessToken: result.accessToken
        });
    }

    logout = async (req: FastifyRequest, reply: FastifyReply) => {
        const refreshToken = req.cookies.refreshToken;
        if (refreshToken) {
            await this.authService.logout(refreshToken);
        }
        reply.clearCookie('refreshToken', { path: '/' });
        reply.clearCookie('accessToken', { path: '/' });
        return reply.send({ message: 'Logged out successfully' });
    }

    refresh = async (req: FastifyRequest, reply: FastifyReply) => {
        const refreshToken = req.cookies.refreshToken;
        if (!refreshToken) {
            throw reply.server.httpErrors.unauthorized('No refresh token provided');
        }

        const result = await this.authService.refresh(refreshToken);

        reply.setCookie('refreshToken', result.refreshToken, {
            path: '/',
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60
        });

        reply.setCookie('accessToken', result.accessToken, {
            path: '/',
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 15 * 60
        });

        return reply.send({
            message: 'Refreshed successfully',
            user: { id: result.user.id, email: result.user.email, role: result.user.role },
            accessToken: result.accessToken
        });
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
}
