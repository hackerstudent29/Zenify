import { FastifyInstance } from 'fastify';
import { prisma } from '../utils/prisma';
import { hashPassword, verifyPassword, hashToken } from '../utils/hash';
import { generateAccessToken, generateRefreshToken } from '../utils/tokens';
import { RegisterInput, LoginInput } from '../controllers/auth.schemas';
import { OAuth2Client } from 'google-auth-library';
import { config } from '../config/env';

const googleClient = new OAuth2Client(config.GOOGLE_CLIENT_ID, config.GOOGLE_CLIENT_SECRET);

export class AuthService {
    constructor(private server: FastifyInstance) { }

    async register(data: RegisterInput) {
        const existingUser = await prisma.user.findUnique({ where: { email: data.email } });
        if (existingUser) throw this.server.httpErrors.conflict('Email already in use');

        const hashedPassword = await hashPassword(data.password);
        const user = await prisma.user.create({
            data: {
                email: data.email,
                password: hashedPassword,
                role: data.role || 'LISTENER',
            },
        });

        const payload = { id: user.id, email: user.email, role: user.role };
        const accessToken = generateAccessToken(this.server, payload);
        const refreshToken = generateRefreshToken(this.server, payload);

        await prisma.refreshToken.create({
            data: {
                tokenHash: hashToken(refreshToken),
                userId: user.id,
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
            },
        });

        return { user: { id: user.id, email: user.email, role: user.role }, accessToken, refreshToken };
    }

    async login(data: LoginInput) {
        const user = await prisma.user.findUnique({ where: { email: data.email } });
        if (!user || !user.password) throw this.server.httpErrors.unauthorized('Invalid email or password');
        const isValid = await verifyPassword(data.password, user.password);
        if (!isValid) throw this.server.httpErrors.unauthorized('Invalid email or password');

        const payload = { id: user.id, email: user.email, role: user.role };
        const accessToken = generateAccessToken(this.server, payload);
        const refreshToken = generateRefreshToken(this.server, payload);

        await prisma.refreshToken.create({
            data: {
                tokenHash: hashToken(refreshToken),
                userId: user.id,
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            },
        });

        return { user: { id: user.id, email: user.email, role: user.role }, accessToken, refreshToken };
    }

    async logout(refreshToken: string) {
        const tokenHash = hashToken(refreshToken);
        await prisma.refreshToken.update({
            where: { tokenHash: tokenHash },
            data: { revoked: true }
        }).catch(() => { /* Ignore if not found */ });
    }

    async refresh(refreshToken: string) {
        const tokenHash = hashToken(refreshToken);
        const storedToken = await prisma.refreshToken.findUnique({
            where: { tokenHash: tokenHash },
            include: { user: true }
        });

        if (!storedToken || storedToken.revoked || storedToken.expiresAt < new Date()) {
            throw this.server.httpErrors.unauthorized('Invalid refresh token');
        }

        // Rotate token
        await prisma.refreshToken.update({
            where: { id: storedToken.id },
            data: { revoked: true }
        });

        const payload = { id: storedToken.user.id, email: storedToken.user.email, role: storedToken.user.role };
        const newAccessToken = generateAccessToken(this.server, payload);
        const newRefreshToken = generateRefreshToken(this.server, payload);

        await prisma.refreshToken.create({
            data: {
                tokenHash: hashToken(newRefreshToken),
                userId: storedToken.userId,
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            },
        });

        return {
            accessToken: newAccessToken,
            refreshToken: newRefreshToken,
            user: { id: storedToken.user.id, email: storedToken.user.email, role: storedToken.user.role }
        };
    }

    async getProfile(userId: string) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, email: true, role: true, createdAt: true }
        });
        if (!user) throw this.server.httpErrors.notFound('User not found');
        return user;
    }

    async updatePassword(userId: string, data: any) {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user || !user.password) throw this.server.httpErrors.unauthorized('User not found or password not set');

        const isValid = await verifyPassword(data.oldPassword, user.password);
        if (!isValid) throw this.server.httpErrors.unauthorized('Invalid old password');

        const hashedPassword = await hashPassword(data.newPassword);
        await prisma.user.update({
            where: { id: userId },
            data: { password: hashedPassword }
        });

        return { message: 'Password updated successfully' };
    }

    async verifyGoogleCode(code: string) {
        try {
            this.server.log.info(`Verifying Google Code: ${code.substring(0, 10)}...`);

            let tokens;
            try {
                // Exchange code for tokens
                const response = await googleClient.getToken({
                    code,
                    redirect_uri: 'postmessage', // Always use this for Google Popup auth-code flow
                });
                tokens = response.tokens;
            } catch (getError: any) {
                this.server.log.error(`Google getToken Error: ${getError.message}`);
                if (getError.response) {
                    this.server.log.error(`Google Response Data: ${JSON.stringify(getError.response.data)}`);
                }
                throw new Error(`Failed to exchange code: ${getError.message}`);
            }

            this.server.log.info('Google Tokens received');

            const idToken = tokens.id_token;
            if (!idToken) {
                this.server.log.error('No ID Token in Google response');
                throw new Error('No ID token in Google response');
            }

            const ticket = await googleClient.verifyIdToken({
                idToken: idToken,
                audience: config.GOOGLE_CLIENT_ID,
            });

            const payload = ticket.getPayload();
            this.server.log.info(`Google Payload Email: ${payload?.email}`);

            if (!payload || !payload.email || !payload.sub) throw new Error('Invalid Google ID Token payload');

            return this.handleGoogleUser(payload.email, payload.sub);

        } catch (error) {
            this.server.log.error(error);
            throw this.server.httpErrors.unauthorized('Google authentication failed');
        }
    }

    private async handleGoogleUser(email: string, googleId: string) {
        let user = await prisma.user.findUnique({ where: { email } });

        if (!user) {
            user = await prisma.user.create({
                data: {
                    email,
                    googleId,
                    provider: 'GOOGLE',
                    role: 'LISTENER',
                },
            });
        } else if (!user.googleId) {
            // Link account if email matches but not linked yet
            await prisma.user.update({
                where: { id: user.id },
                data: { googleId, provider: 'GOOGLE' }
            });
        }

        const tokenPayload = { id: user.id, email: user.email, role: user.role };
        const accessToken = generateAccessToken(this.server, tokenPayload);
        const refreshToken = generateRefreshToken(this.server, tokenPayload);

        await prisma.refreshToken.create({
            data: {
                tokenHash: hashToken(refreshToken),
                userId: user.id,
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            },
        });

        return { user: { id: user.id, email: user.email, role: user.role }, accessToken, refreshToken };
    }
}
