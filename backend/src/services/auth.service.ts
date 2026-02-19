import { FastifyInstance } from 'fastify';
import { prisma } from '../utils/prisma';
import { MailService } from './mail.service';
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

        // If user not found, or user exists but has no password (e.g. Google auth only)
        if (!user) {
            throw this.server.httpErrors.unauthorized('Invalid email or password');
        }

        if (!user.password) {
            // User exists but has no password set (likely a social login account)
            throw this.server.httpErrors.unauthorized('Please login with Google or reset your password');
        }

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
        const storedToken = await (prisma as any).refreshToken.findUnique({
            where: { tokenHash: tokenHash },
            include: { user: true }
        });

        if (!storedToken || storedToken.revoked || storedToken.expiresAt < new Date()) {
            throw this.server.httpErrors.unauthorized('Invalid refresh token');
        }

        // Rotate token
        await (prisma as any).refreshToken.update({
            where: { id: storedToken.id },
            data: { revoked: true }
        });

        const payload = { id: storedToken.user.id, email: storedToken.user.email, role: storedToken.user.role };
        const newAccessToken = generateAccessToken(this.server, payload);
        const newRefreshToken = generateRefreshToken(this.server, payload);

        await (prisma as any).refreshToken.create({
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
        const user = await (prisma as any).user.findUnique({
            where: { id: userId },
            include: { preferences: true, subscription: true },
        });
        if (!user) throw this.server.httpErrors.notFound('User not found');
        const { password, ...userWithoutPassword } = user;
        return userWithoutPassword;
    }

    async getSessions(userId: string) {
        const tokens = await (prisma as any).refreshToken.findMany({
            where: {
                userId,
                revoked: false,
                expiresAt: { gt: new Date() }
            },
            orderBy: { createdAt: 'desc' },
            take: 5
        });

        // Map tokens to session objects (normally we'd store user-agent info)
        return tokens.map((t: any, i: number) => ({
            id: t.id,
            device: i === 0 ? "Current Device" : "Other Session",
            location: "Unknown",
            browser: "Web Browser",
            active: i === 0,
            lastUsed: t.createdAt
        }));
    }

    async getSubscription(userId: string) {
        const sub = await (prisma as any).subscription.findUnique({
            where: { userId }
        });
        return sub || { status: 'INACTIVE', plan: 'FREE' };
    }

    private static otpCache = new Map<string, { otp: string, expires: number, lastRequestAt: number }>();

    async requestOTP(email: string) {
        const now = Date.now();
        const emailKey = email.toLowerCase();
        const existing = AuthService.otpCache.get(emailKey);

        // 30 second cooldown to prevent duplicate sends
        if (existing && (now - existing.lastRequestAt) < 30000) {
            return { message: 'Please wait a moment before requesting another code' };
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        AuthService.otpCache.set(emailKey, {
            otp,
            expires: now + 10 * 60 * 1000, // 10 mins
            lastRequestAt: now
        });

        try {
            await MailService.sendOTP(email, otp);
            return { message: 'OTP sent successfully' };
        } catch (error) {
            this.server.log.error(error);
            throw this.server.httpErrors.internalServerError('Failed to send email');
        }
    }

    async verifyOTP(email: string, otp: string) {
        const emailKey = email.toLowerCase();
        const cached = AuthService.otpCache.get(emailKey);
        if (!cached || cached.otp !== otp || cached.expires < Date.now()) {
            throw this.server.httpErrors.unauthorized('Invalid or expired OTP');
        }
        AuthService.otpCache.delete(emailKey);
        return { message: 'OTP verified successfully' };
    }

    async updatePreferences(userId: string, prefData: any) {
        // Filter out fields that belong to the User model or metadata
        const { displayName, name, id, userId: _ui, createdAt, updatedAt, ...preferences } = prefData;
        const userName = displayName || name;

        try {
            // Update User name if provided
            if (userName) {
                await (prisma as any).user.update({
                    where: { id: userId },
                    data: { name: userName }
                });
            }

            const user = await (prisma as any).user.findUnique({
                where: { id: userId },
                include: { preferences: true }
            });

            if (!user) throw this.server.httpErrors.notFound('User not found');

            if (user.preferences) {
                return await (prisma as any).userPreferences.update({
                    where: { userId },
                    data: preferences
                });
            } else {
                return await (prisma as any).userPreferences.create({
                    data: {
                        userId,
                        ...preferences
                    }
                });
            }
        } catch (error) {
            this.server.log.error(error);
            throw this.server.httpErrors.internalServerError('Failed to updates preferences in database');
        }
    }

    async updatePassword(userId: string, data: any) {
        this.server.log.info({ userId, hasOtp: !!data.otp }, 'Attempting password update');

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw this.server.httpErrors.notFound('User not found');

        const emailKey = user.email.toLowerCase();

        // If OTP is provided, verify it instead of oldPassword
        if (data.otp) {
            this.server.log.info({ email: emailKey }, 'Verifying password update via OTP');
            const cached = AuthService.otpCache.get(emailKey);

            if (!cached) {
                this.server.log.warn({ email: emailKey }, 'No cached OTP found for password update');
                throw this.server.httpErrors.unauthorized('Security code not found. Please request a new one.');
            }

            if (cached.otp !== data.otp) {
                this.server.log.warn({ email: emailKey, sent: data.otp, expected: cached.otp }, 'OTP mismatch for password update');
                throw this.server.httpErrors.unauthorized('Invalid security code');
            }

            if (cached.expires < Date.now()) {
                this.server.log.warn({ email: emailKey }, 'OTP expired for password update');
                throw this.server.httpErrors.unauthorized('Security code expired');
            }

            AuthService.otpCache.delete(emailKey);
            this.server.log.info({ email: emailKey }, 'OTP verified successfully for password update');
        } else {
            // Otherwise, require and verify the old password (if they have one)
            if (!user.password) {
                throw this.server.httpErrors.unauthorized('Account has no password set. Please use security code to set a password.');
            }
            const isValid = await verifyPassword(data.oldPassword, user.password);
            if (!isValid) throw this.server.httpErrors.unauthorized('Invalid current password');
        }

        const hashedPassword = await hashPassword(data.newPassword);
        await prisma.user.update({
            where: { id: userId },
            data: { password: hashedPassword }
        });

        this.server.log.info({ userId }, 'Password updated successfully');
        return { message: 'Password updated successfully' };
    }

    async resetPassword(data: any) {
        const emailKey = data.email.toLowerCase();
        const user = await prisma.user.findUnique({ where: { email: emailKey } });
        if (!user) throw this.server.httpErrors.notFound('User not found');

        // OTP Verification
        const cached = AuthService.otpCache.get(emailKey);
        if (!cached || cached.otp !== data.otp || cached.expires < Date.now()) {
            throw this.server.httpErrors.unauthorized('Invalid or expired OTP');
        }

        const hashedPassword = await hashPassword(data.password);
        await prisma.user.update({
            where: { id: user.id },
            data: { password: hashedPassword }
        });

        AuthService.otpCache.delete(emailKey);
        return { message: 'Password reset successfully' };
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
