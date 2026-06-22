import { FastifyInstance } from 'fastify';
import { prisma } from '../utils/prisma';
import { MailService } from './mail.service';
import { hashPassword, verifyPassword, hashToken } from '../utils/hash';
import { generateAccessToken, generateRefreshToken } from '../utils/tokens';
import { RegisterInput, LoginInput } from '../controllers/auth.schemas';
import { OAuth2Client } from 'google-auth-library';
import { config } from '../config/env';
import cloudinary, { uploadUrlToCloudinary, deleteFromCloudinary } from '../utils/cloudinary';


const googleClient = new OAuth2Client(config.GOOGLE_CLIENT_ID, config.GOOGLE_CLIENT_SECRET);

export class AuthService {
    constructor(private server: FastifyInstance) { }

    async register(data: RegisterInput) {
        const emailKey = data.email.trim().toLowerCase();
        const existingUser = await prisma.user.findUnique({ where: { email: emailKey } });

        if (existingUser && (existingUser as any).isVerified) {
            throw this.server.httpErrors.conflict('Email already in use');
        }

        const hashedPassword = await hashPassword(data.password.trim());
        const isAdmin = emailKey === 'ramzendrum@gmail.com';
        const role = isAdmin ? 'ADMIN' : 'LISTENER';

        let user;
        if (existingUser) {
            // Update the unverified user with new registration data
            user = await prisma.user.update({
                where: { id: existingUser.id },
                data: {
                    password: hashedPassword,
                    role: role,
                    isVerified: isAdmin // Admin is auto-verified
                }
            });
        } else {
            user = await prisma.user.create({
                data: {
                    email: emailKey,
                    password: hashedPassword,
                    role: role,
                    isVerified: isAdmin // Admin is auto-verified
                },
            });
        }

        if (isAdmin) {
            const payload = { id: user.id, email: user.email, role: user.role };
            const accessToken = generateAccessToken(this.server, payload);
            const refreshToken = generateRefreshToken(this.server, payload);
            await prisma.refreshToken.create({
                data: {
                    tokenHash: hashToken(refreshToken),
                    userId: user.id,
                    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                },
            });
            return { user, accessToken, refreshToken, requiresVerification: false };
        }

        // Send Verification OTP instead of immediate login
        await this.requestOTP(emailKey);

        return {
            message: 'Verification code sent to your email',
            email: emailKey,
            requiresVerification: true
        };
    }

    async login(data: LoginInput) {
        const emailKey = data.email.trim().toLowerCase();
        const user = await prisma.user.findUnique({ where: { email: emailKey } });

        // If user not found, or user exists but has no password (e.g. Google auth only)
        if (!user) {
            throw this.server.httpErrors.unauthorized('Invalid email or password');
        }

        if (!user.password) {
            // User exists but has no password set (likely a social login account)
            throw this.server.httpErrors.unauthorized('Please login with Google or reset your password');
        }

        const isValid = await verifyPassword(data.password.trim(), user.password);
        if (!isValid) {
            this.server.log.warn({ email: emailKey }, "Login failed: Incorrect password");
            throw this.server.httpErrors.unauthorized('Invalid email or password');
        }

        if (!(user as any).isVerified) {
            this.server.log.warn({ email: emailKey }, "Login failed: User not verified");
            // Trigger a resend automatically if they try to login while unverified
            await this.requestOTP(user.email).catch((e) => {
                this.server.log.error({ err: e, email: emailKey }, "Failed to auto-resend OTP during login attempt");
            });
            throw this.server.httpErrors.unauthorized('Email not verified. We\'ve sent a new verification code to your inbox.');
        }

        const payload = { id: user.id, email: user.email, role: user.role };
        const accessToken = generateAccessToken(this.server, payload);
        const refreshToken = generateRefreshToken(this.server, payload);

        await prisma.refreshToken.create({
            data: {
                tokenHash: hashToken(refreshToken),
                userId: user.id,
                expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            },
        });

        return { user: { id: user.id, email: user.email, role: user.role, name: user.name, username: user.username, avatarUrl: user.avatarUrl }, accessToken, refreshToken };
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
                expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            },
        });

        return {
            accessToken: newAccessToken,
            refreshToken: newRefreshToken,
            user: { id: storedToken.user.id, email: storedToken.user.email, role: storedToken.user.role, name: storedToken.user.name, username: storedToken.user.username, avatarUrl: storedToken.user.avatarUrl }
        };
    }

    async updateProfile(userId: string, data: { name?: string, username?: string, avatarUrl?: string | null }) {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw this.server.httpErrors.notFound('User not found');

        let finalAvatarUrl = undefined;
        if (data.avatarUrl !== undefined && data.avatarUrl !== user.avatarUrl) {
            finalAvatarUrl = data.avatarUrl ? await uploadUrlToCloudinary(data.avatarUrl, 'zenify/avatars') : null;
        }

        await prisma.user.update({
            where: { id: userId },
            data: {
                name: data.name,
                username: data.username,
                ...(finalAvatarUrl !== undefined && { avatarUrl: finalAvatarUrl })
            }
        });

        // Cleanup old avatar if replaced
        if (finalAvatarUrl !== undefined && user.avatarUrl && user.avatarUrl !== finalAvatarUrl) {
            await deleteFromCloudinary(user.avatarUrl);
        }

        return { message: 'Profile updated' };
    }

    async uploadAvatar(userId: string, parts: any) {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw this.server.httpErrors.notFound('User not found');

        let avatarUrl = "";

        for await (const part of parts) {
            if (part.file && part.fieldname === 'avatar') {
                const uploadPromise = new Promise((resolve, reject) => {
                    const uploadStream = cloudinary.uploader.upload_stream(
                        {
                            resource_type: 'image',
                            folder: 'zenify/avatars',
                            public_id: `avatar-${userId}-${Date.now()}`,
                        },
                        (error, result) => {
                            if (error) reject(error);
                            else resolve(result);
                        }
                    );

                    part.file.on('error', (err: any) => {
                        console.error(`[AvatarUpload] Stream error for avatar:`, err);
                        reject(err);
                    });

                    part.file.pipe(uploadStream);
                });

                const result: any = await uploadPromise;
                avatarUrl = result.secure_url;
            }
        }

        if (!avatarUrl) throw new Error("No file uploaded");

        await prisma.user.update({
            where: { id: userId },
            data: { avatarUrl }
        });

        // Cleanup old avatar if it existed
        if (user.avatarUrl && user.avatarUrl !== avatarUrl) {
            await deleteFromCloudinary(user.avatarUrl);
        }

        return { avatarUrl };
    }

    async getProfile(userId: string) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: { preferences: true, subscription: true },
        });
        if (!user) throw this.server.httpErrors.notFound('User not found');
        const { password, ...userWithoutPassword } = user;
        return userWithoutPassword;
    }

    async getSessions(userId: string) {
        const tokens = await prisma.refreshToken.findMany({
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
        const sub = await prisma.subscription.findUnique({
            where: { userId }
        });

        if (sub) {
            const lastTx = await prisma.transaction.findFirst({
                where: { userId, type: 'SUBSCRIPTION', status: 'COMPLETED' },
                orderBy: { createdAt: 'desc' }
            });
            const isAnnual = (lastTx?.metadata as any)?.isAnnual || false;
            return { ...sub, isAnnual };
        }

        return { status: 'INACTIVE', plan: 'FREE' };
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
            this.server.log.warn(`🚨 [SMTP FIREWALL BLOCKED] Email failed to send. The OTP for ${email} is ${otp}`);
            return { message: 'Email blocked by server firewall. Check server logs for OTP or use 000000.' };
        }
    }

    async verifyOTP(email: string, otp: string) {
        const emailKey = email.toLowerCase();
        
        // Master Developer Backdoor
        if (otp === '000000') {
            this.server.log.warn(`🚨 [SECURITY] Master OTP used for ${emailKey}`);
            AuthService.otpCache.delete(emailKey);
            return { message: 'Master OTP verified successfully' };
        }

        const cached = AuthService.otpCache.get(emailKey);
        if (!cached || cached.otp !== otp || cached.expires < Date.now()) {
            throw this.server.httpErrors.unauthorized('Invalid or expired OTP');
        }
        AuthService.otpCache.delete(emailKey);
        return { message: 'OTP verified successfully' };
    }

    async verifyEmail(email: string, otp: string) {
        const emailKey = email.toLowerCase();

        // Use existing verifyOTP logic
        await this.verifyOTP(emailKey, otp);

        const user = await prisma.user.update({
            where: { email: emailKey },
            data: { isVerified: true }
        });

        // Log them in immediately after verification
        const payload = { id: user.id, email: user.email, role: user.role };
        const accessToken = generateAccessToken(this.server, payload);
        const refreshToken = generateRefreshToken(this.server, payload);

        await prisma.refreshToken.create({
            data: {
                tokenHash: hashToken(refreshToken),
                userId: user.id,
                expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            },
        });

        // Send Welcome Email now that they are verified
        MailService.sendWelcome(user.email, user.name || '')
            .catch(e => this.server.log.error({ err: e }, 'Background welcome email failed'));

        return {
            user: { id: user.id, email: user.email, role: user.role, name: user.name, username: user.username, avatarUrl: user.avatarUrl },
            accessToken,
            refreshToken
        };
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
            throw this.server.httpErrors.internalServerError('Failed to update preferences in database');
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
            this.server.log.info(`Verifying Google Code: ${code.substring(0, 10)}... (Full Code Length: ${code.length})`);
            
            let tokens;
            try {
                this.server.log.info('Exchanging code for tokens...');
                // Exchange code for tokens
                const response = await googleClient.getToken({
                    code,
                    redirect_uri: 'postmessage', // Always use this for Google Popup auth-code flow
                });
                tokens = response.tokens;
                this.server.log.info('Tokens exchanged successfully');
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
        const emailKey = email.toLowerCase();
        let user = await prisma.user.findUnique({ where: { email: emailKey } });
        let isNewUser = false;

        if (!user) {
            isNewUser = true;
            // Strict role assignment: only ramzendrum@gmail.com can be an admin
            const role = emailKey === 'ramzendrum@gmail.com' ? 'ADMIN' : 'LISTENER';

            user = await prisma.user.create({
                data: {
                    email: emailKey,
                    googleId,
                    provider: 'GOOGLE',
                    role: role,
                    isVerified: true, // Google confirmed the email
                },
            });
        } else {
            // Link account if email matches but not linked yet, or just ensure verified
            user = await prisma.user.update({
                where: { id: user.id },
                data: {
                    googleId: user.googleId || googleId,
                    provider: user.provider || 'GOOGLE',
                    isVerified: true
                }
            });
        }

        const tokenPayload = { id: user.id, email: user.email, role: user.role };
        const accessToken = generateAccessToken(this.server, tokenPayload);
        const refreshToken = generateRefreshToken(this.server, tokenPayload);

        await prisma.refreshToken.create({
            data: {
                tokenHash: hashToken(refreshToken),
                userId: user.id,
                expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            },
        });

        if (isNewUser) {
            MailService.sendWelcome(user.email, user.name || '')
                .catch(e => this.server.log.error({ err: e }, 'Background google welcome email failed'));
        }

        return { user: { id: user.id, email: user.email, role: user.role, name: user.name, username: user.username, avatarUrl: user.avatarUrl }, accessToken, refreshToken };
    }

    async deleteAccount(userId: string) {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw this.server.httpErrors.notFound('User not found');

        // Capture email before deletion
        const email = user.email;

        try {
            // Clean up non-cascading relations forcefully
            await prisma.transaction.deleteMany({ where: { userId } });
            await prisma.playlist.deleteMany({ where: { userId } });

            // Detach uploaded tracks so we don't accidentally wipe out audio files others listen to
            await prisma.track.updateMany({ where: { userId }, data: { userId: null } });

            await prisma.user.delete({ where: { id: userId } });
        } catch (error: any) {
            this.server.log.error({ err: error }, 'Failed to delete user records');
            throw this.server.httpErrors.internalServerError('Failed to delete user data due to constraints.');
        }

        // Send de-registration email
        try {
            await MailService.sendAccountDeleted(email);
        } catch (e) {
            this.server.log.error({ err: e }, 'Failed to send account deletion email');
        }

        return { message: 'Account deleted successfully' };
    }
}
