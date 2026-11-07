import crypto from 'crypto';
import { FastifyInstance } from 'fastify';
import { prisma } from '../utils/prisma';
import { MailService } from './mail.service';
import { hashPassword, verifyPassword, hashToken } from '../utils/hash';
import { generateAccessToken, generateRefreshToken } from '../utils/tokens';
import { RegisterInput, LoginInput } from '../controllers/auth.schemas';
import { OAuth2Client } from 'google-auth-library';
import { config } from '../config/env';
import path from 'path';
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
        const adminEmail = config.ADMIN_EMAIL ? config.ADMIN_EMAIL.toLowerCase().trim() : 'ramzendrum@gmail.com';
        const isAdmin = emailKey === adminEmail;
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
            const safeUser = { id: user.id, email: user.email, role: user.role, name: user.name, username: user.username, avatarUrl: user.avatarUrl };
            return { user: safeUser, accessToken, refreshToken, requiresVerification: false };
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
        const user = await prisma.user.findUnique({ 
            where: { email: emailKey },
            include: { preferences: true }
        });

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

        return { user: { id: user.id, email: user.email, role: user.role, name: user.name, username: user.username, avatarUrl: user.avatarUrl, preferences: user.preferences }, accessToken, refreshToken };
    }

    async logout(refreshToken?: string, sessionId?: string) {
        if (sessionId) {
            await prisma.session.update({
                where: { id: sessionId },
                data: { revokedAt: new Date() }
            }).catch(() => {});
        }
        if (refreshToken) {
            const refreshHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
            await prisma.session.updateMany({
                where: { refreshHash },
                data: { revokedAt: new Date() }
            }).catch(() => {});
            const tokenHash = hashToken(refreshToken);
            await prisma.refreshToken.updateMany({
                where: { tokenHash },
                data: { revoked: true }
            }).catch(() => {});
        }
    }

    async refresh(refreshToken: string) {
        const refreshHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
        const session = await prisma.session.findUnique({
            where: { refreshHash },
            include: { user: { include: { preferences: true } } }
        });

        if (session) {
            if (session.revokedAt) {
                // Token reuse detected! Invalidate entire token family immediately
                await prisma.session.updateMany({
                    where: { familyId: session.familyId },
                    data: { revokedAt: new Date() }
                });
                throw this.server.httpErrors.unauthorized('Session terminated due to refresh token reuse detection.');
            }
            if (session.expiresAt < new Date()) {
                throw this.server.httpErrors.unauthorized('Session expired. Please sign in again.');
            }

            // Revoke current session
            await prisma.session.update({
                where: { id: session.id },
                data: { revokedAt: new Date() }
            });

            // Issue new rotating session with same familyId
            const newSession = await this.createSession(session.user, {
                deviceId: session.deviceId || undefined,
                deviceName: session.deviceName || undefined,
                platform: session.platform || undefined,
                appVersion: session.appVersion || undefined
            }, session.familyId);

            return {
                accessToken: newSession.accessToken,
                refreshToken: newSession.refreshToken,
                user: {
                    id: session.user.id,
                    email: session.user.email,
                    role: session.user.role,
                    name: session.user.name,
                    displayName: session.user.displayName || session.user.name,
                    username: session.user.username,
                    avatarUrl: session.user.avatarUrl,
                    preferences: (session.user as any).preferences
                }
            };
        }

        // Fallback for legacy refresh tokens
        const tokenHash = hashToken(refreshToken);
        const storedToken = await prisma.refreshToken.findUnique({
            where: { tokenHash },
            include: { user: { include: { preferences: true } } }
        });

        if (!storedToken || storedToken.revoked || storedToken.expiresAt < new Date()) {
            throw this.server.httpErrors.unauthorized('Invalid refresh token');
        }

        await prisma.refreshToken.update({
            where: { id: storedToken.id },
            data: { revoked: true }
        });

        const newSession = await this.createSession(storedToken.user);

        return {
            accessToken: newSession.accessToken,
            refreshToken: newSession.refreshToken,
            user: {
                id: storedToken.user.id,
                email: storedToken.user.email,
                role: storedToken.user.role,
                name: storedToken.user.name,
                displayName: storedToken.user.displayName || storedToken.user.name,
                username: storedToken.user.username,
                avatarUrl: storedToken.user.avatarUrl,
                preferences: (storedToken.user as any).preferences
            }
        };
    }

    async updateProfile(userId: string, data: { name?: string, username?: string, avatarUrl?: string | null, timezone?: string }) {
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
                ...(finalAvatarUrl !== undefined && { avatarUrl: finalAvatarUrl }),
                ...(data.timezone !== undefined && { timezone: data.timezone })
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
                const ext = path.extname(part.filename || '').toLowerCase();
                const allowedExts = ['.jpg', '.jpeg', '.png', '.webp', '.avif'];
                if (!allowedExts.includes(ext) || (part.mimetype && !part.mimetype.startsWith('image/'))) {
                    throw this.server.httpErrors.badRequest('Invalid avatar image format. Supported formats: JPG, PNG, WebP, AVIF.');
                }

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

    async createSession(user: any, deviceMeta?: { deviceId?: string, deviceName?: string, platform?: string, appVersion?: string }, familyId?: string) {
        const famId = familyId || crypto.randomUUID();
        const sessionId = crypto.randomUUID();
        const refreshTokenOpaque = crypto.randomBytes(32).toString('hex');
        const refreshHash = crypto.createHash('sha256').update(refreshTokenOpaque).digest('hex');

        const tokenPayload = { id: user.id, email: user.email, role: user.role, sid: sessionId };
        const accessToken = generateAccessToken(this.server, tokenPayload);

        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

        await prisma.session.create({
            data: {
                id: sessionId,
                userId: user.id,
                refreshHash,
                familyId: famId,
                deviceId: deviceMeta?.deviceId || null,
                deviceName: deviceMeta?.deviceName || (deviceMeta?.platform ? `${deviceMeta.platform.toUpperCase()} Device` : 'Active Client'),
                platform: deviceMeta?.platform || 'android',
                appVersion: deviceMeta?.appVersion || '1.0.0',
                expiresAt,
                lastUsedAt: new Date()
            }
        });

        // Also create legacy RefreshToken for backwards compatibility with web cookies
        await prisma.refreshToken.create({
            data: {
                tokenHash: hashToken(refreshTokenOpaque),
                userId: user.id,
                expiresAt
            }
        }).catch(() => {});

        return { accessToken, refreshToken: refreshTokenOpaque, sessionId };
    }

    async getSessions(userId: string) {
        const sessions = await prisma.session.findMany({
            where: {
                userId,
                revokedAt: null,
                expiresAt: { gt: new Date() }
            },
            orderBy: { lastUsedAt: 'desc' },
            take: 10
        });

        if (sessions.length > 0) {
            return sessions.map((s, i) => ({
                id: s.id,
                device: s.deviceName || (s.platform ? `${s.platform.toUpperCase()} Device` : 'Active Session'),
                location: 'Unknown',
                browser: s.platform || 'Mobile',
                active: i === 0,
                lastUsed: s.lastUsedAt,
                createdAt: s.createdAt,
                deviceId: s.deviceId
            }));
        }

        // Fallback to legacy tokens
        const tokens = await prisma.refreshToken.findMany({
            where: {
                userId,
                revoked: false,
                expiresAt: { gt: new Date() }
            },
            orderBy: { createdAt: 'desc' },
            take: 5
        });

        return tokens.map((t: any, i: number) => ({
            id: t.id,
            device: i === 0 ? "Current Device" : "Other Session",
            location: "Unknown",
            browser: "Web Browser",
            active: i === 0,
            lastUsed: t.createdAt
        }));
    }

    async revokeSession(userId: string, sessionId: string) {
        await prisma.session.updateMany({
            where: { id: sessionId, userId },
            data: { revokedAt: new Date() }
        });
        return { message: 'Session revoked successfully' };
    }

    async logoutAll(userId: string) {
        await prisma.session.updateMany({
            where: { userId, revokedAt: null },
            data: { revokedAt: new Date() }
        });
        await prisma.refreshToken.updateMany({
            where: { userId, revoked: false },
            data: { revoked: true }
        });
        return { message: 'All sessions logged out successfully' };
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

    async requestOTP(email: string, clientIp?: string) {
        const now = Date.now();
        const emailKey = email.trim().toLowerCase();

        // 1. Cooldown limit: 45 seconds per email
        const lastOtp = await prisma.otpCode.findFirst({
            where: { email: emailKey },
            orderBy: { createdAt: 'desc' }
        });
        if (lastOtp && (now - lastOtp.createdAt.getTime()) < 45000) {
            const retryAfterSec = Math.ceil((45000 - (now - lastOtp.createdAt.getTime())) / 1000);
            throw this.server.httpErrors.tooManyRequests(`Please wait ${retryAfterSec}s before requesting a new code.`);
        }

        // 2. Hourly limit: max 5 requests per hour
        const hourAgo = new Date(now - 60 * 60 * 1000);
        const hourlyCount = await prisma.otpCode.count({
            where: { email: emailKey, createdAt: { gt: hourAgo } }
        });
        if (hourlyCount >= 5) {
            throw this.server.httpErrors.tooManyRequests('Too many verification requests for this email. Please try again in an hour.');
        }

        // 3. Daily limit: max 10 requests per day
        const dayAgo = new Date(now - 24 * 60 * 60 * 1000);
        const dailyCount = await prisma.otpCode.count({
            where: { email: emailKey, createdAt: { gt: dayAgo } }
        });
        if (dailyCount >= 10) {
            throw this.server.httpErrors.tooManyRequests('Daily verification limit exceeded for this email. Please try again tomorrow.');
        }

        // 4. IP limit: max 20 requests per hour per IP
        let ipHash: string | null = null;
        if (clientIp) {
            ipHash = crypto.createHash('sha256').update(clientIp).digest('hex');
            const ipHourlyCount = await prisma.otpCode.count({
                where: { requestIpHash: ipHash, createdAt: { gt: hourAgo } }
            });
            if (ipHourlyCount >= 20) {
                throw this.server.httpErrors.tooManyRequests('Too many requests from this IP address. Please try again later.');
            }
        }

        // Generate cryptographically secure 6-digit code
        const code = crypto.randomInt(100000, 1000000).toString();
        const codeHash = crypto.createHmac('sha256', config.JWT_SECRET).update(`${emailKey}:${code}`).digest('hex');

        // Invalidate older unconsumed codes for this email
        await prisma.otpCode.updateMany({
            where: { email: emailKey, consumedAt: null },
            data: { consumedAt: new Date() }
        });

        // Store hashed code in database
        await prisma.otpCode.create({
            data: {
                email: emailKey,
                codeHash,
                expiresAt: new Date(now + 10 * 60 * 1000), // 10 minutes
                attempts: 0,
                requestIpHash: ipHash
            }
        });

        try {
            await MailService.sendOTP(emailKey, code);
            return {
                message: 'Verification code sent successfully',
                email: emailKey,
                cooldownSec: 45
            };
        } catch (error) {
            this.server.log.error(error);
            throw this.server.httpErrors.serviceUnavailable('Failed to send verification email. Please try again later.');
        }
    }

    async verifyOTP(email: string, otp: string, deviceMeta?: { deviceId?: string, deviceName?: string, platform?: string, appVersion?: string }) {
        const emailKey = email.trim().toLowerCase();
        const now = new Date();

        // Dev override check
        const isDevOtp = (config.ALLOW_DEV_OTP === 'true' && otp === '000000' && config.NODE_ENV !== 'production');

        let activeOtp: any = null;
        if (!isDevOtp) {
            activeOtp = await prisma.otpCode.findFirst({
                where: { email: emailKey, consumedAt: null },
                orderBy: { createdAt: 'desc' }
            });

            if (!activeOtp || activeOtp.expiresAt < now) {
                throw this.server.httpErrors.unauthorized('Verification code has expired or is invalid. Please request a new code.');
            }

            if (activeOtp.attempts >= 5) {
                await prisma.otpCode.update({ where: { id: activeOtp.id }, data: { consumedAt: now } });
                throw this.server.httpErrors.tooManyRequests('Too many incorrect attempts. This code has been locked. Please request a new code.');
            }

            const expectedHash = crypto.createHmac('sha256', config.JWT_SECRET).update(`${emailKey}:${otp}`).digest('hex');
            const isMatch = (activeOtp.codeHash === expectedHash);

            if (!isMatch) {
                const updatedAttempts = activeOtp.attempts + 1;
                await prisma.otpCode.update({ where: { id: activeOtp.id }, data: { attempts: updatedAttempts } });
                const remaining = 5 - updatedAttempts;
                if (remaining <= 0) {
                    await prisma.otpCode.update({ where: { id: activeOtp.id }, data: { consumedAt: now } });
                    throw this.server.httpErrors.unauthorized('Incorrect code. Maximum attempts reached. Please request a new code.');
                }
                throw this.server.httpErrors.unauthorized(`Incorrect code. ${remaining} attempt(s) remaining.`);
            }

            // Mark consumed
            await prisma.otpCode.update({ where: { id: activeOtp.id }, data: { consumedAt: now } });
        }

        // Find or create user
        let user = await prisma.user.findUnique({
            where: { email: emailKey },
            include: { preferences: true }
        });
        let isNewUser = false;

        if (!user) {
            isNewUser = true;
            const adminEmail = config.ADMIN_EMAIL ? config.ADMIN_EMAIL.toLowerCase().trim() : 'ramzendrum@gmail.com';
            const role = emailKey === adminEmail ? 'ADMIN' : 'LISTENER';
            user = await prisma.user.create({
                data: {
                    email: emailKey,
                    role,
                    isVerified: true,
                    preferences: { create: {} }
                },
                include: { preferences: true }
            });
        } else if (!user.isVerified) {
            user = await prisma.user.update({
                where: { id: user.id },
                data: { isVerified: true },
                include: { preferences: true }
            });
        }

        // Upsert email auth identity
        await prisma.authIdentity.upsert({
            where: { provider_providerUserId: { provider: 'email', providerUserId: emailKey } },
            create: {
                userId: user.id,
                provider: 'email',
                providerUserId: emailKey,
                email: emailKey
            },
            update: {
                userId: user.id,
                email: emailKey
            }
        });

        const session = await this.createSession(user, deviceMeta);

        if (isNewUser) {
            MailService.sendWelcome(user.email, user.name || '')
                .catch(e => this.server.log.error({ err: e }, 'Background email welcome failed'));
        }

        return {
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                name: user.name,
                displayName: user.displayName || user.name,
                username: user.username,
                avatarUrl: user.avatarUrl,
                preferences: user.preferences
            },
            accessToken: session.accessToken,
            refreshToken: session.refreshToken,
            sessionId: session.sessionId,
            isNewUser
        };
    }

    async verifyEmail(email: string, otp: string, deviceMeta?: { deviceId?: string, deviceName?: string, platform?: string, appVersion?: string }) {
        return await this.verifyOTP(email, otp, deviceMeta);
    }

    async verifyGoogleIdToken(idToken: string, deviceMeta?: { deviceId?: string, deviceName?: string, platform?: string, appVersion?: string }) {
        try {
            const ticket = await googleClient.verifyIdToken({
                idToken: idToken,
                audience: config.GOOGLE_CLIENT_ID,
            });

            const payload = ticket.getPayload();
            if (!payload || !payload.sub) {
                throw new Error('Invalid Google ID Token payload: missing subject claim');
            }
            if (!payload.email) {
                throw new Error('Invalid Google ID Token payload: missing email');
            }
            if (!payload.email_verified) {
                throw new Error('Google email is not verified');
            }

            return await this.handleGoogleUser(payload.email, payload.sub, payload, deviceMeta);
        } catch (error: any) {
            this.server.log.error({ err: error.message }, 'verifyGoogleIdToken failed');
            if (error.statusCode) throw error;
            throw this.server.httpErrors.unauthorized(`Google ID Token authentication failed: ${error.message}`);
        }
    }

    async verifyGoogleCode(code: string, deviceMeta?: { deviceId?: string, deviceName?: string, platform?: string, appVersion?: string }) {
        try {
            this.server.log.info(`Verifying Google Code: ${code.substring(0, 10)}... (Full Code Length: ${code.length})`);

            let tokens;
            try {
                this.server.log.info('Exchanging code for tokens...');
                const response = await googleClient.getToken({
                    code,
                    redirect_uri: 'postmessage',
                });
                tokens = response.tokens;
                this.server.log.info('Tokens exchanged successfully');
            } catch (getError: any) {
                const googleErrData = getError.response?.data;
                this.server.log.error({ googleErrData, msg: getError.message }, 'Google getToken Error');
                const detail = googleErrData?.error_description || googleErrData?.error || getError.message;
                throw this.server.httpErrors.unauthorized(`Google token exchange failed: ${detail}`);
            }

            const idToken = tokens.id_token;
            if (!idToken) {
                throw new Error('No ID token in Google response');
            }

            return await this.verifyGoogleIdToken(idToken, deviceMeta);
        } catch (error: any) {
            this.server.log.error({ err: error.message }, 'Google code exchange outer catch');
            if (error.statusCode) throw error;
            throw this.server.httpErrors.unauthorized(`Google authentication failed: ${error.message}`);
        }
    }

    private async handleGoogleUser(email: string, googleId: string, payload?: any, deviceMeta?: any) {
        const emailKey = email.trim().toLowerCase();

        // Check if identity already exists
        let identity = await prisma.authIdentity.findUnique({
            where: { provider_providerUserId: { provider: 'google', providerUserId: googleId } },
            include: { user: { include: { preferences: true } } }
        });

        let user = identity?.user;
        let isNewUser = false;

        if (!user) {
            // Check if user exists with this email
            user = await prisma.user.findUnique({
                where: { email: emailKey },
                include: { preferences: true }
            });

            if (!user) {
                isNewUser = true;
                const adminEmail = config.ADMIN_EMAIL ? config.ADMIN_EMAIL.toLowerCase().trim() : 'ramzendrum@gmail.com';
                const role = emailKey === adminEmail ? 'ADMIN' : 'LISTENER';
                const name = payload?.name || payload?.given_name || 'Listener';

                user = await prisma.user.create({
                    data: {
                        email: emailKey,
                        name,
                        displayName: name,
                        avatarUrl: payload?.picture || null,
                        googleId,
                        provider: 'GOOGLE',
                        role,
                        isVerified: true,
                        preferences: { create: {} }
                    },
                    include: { preferences: true }
                });
            } else {
                user = await prisma.user.update({
                    where: { id: user.id },
                    data: {
                        googleId: user.googleId || googleId,
                        isVerified: true,
                        avatarUrl: user.avatarUrl || payload?.picture || null,
                        displayName: user.displayName || user.name || payload?.name || null
                    },
                    include: { preferences: true }
                });
            }

            // Upsert Google auth identity
            await prisma.authIdentity.upsert({
                where: { provider_providerUserId: { provider: 'google', providerUserId: googleId } },
                create: {
                    userId: user.id,
                    provider: 'google',
                    providerUserId: googleId,
                    email: emailKey
                },
                update: {
                    userId: user.id,
                    email: emailKey
                }
            });
        }

        const session = await this.createSession(user, deviceMeta);

        if (isNewUser) {
            MailService.sendWelcome(user.email, user.name || '')
                .catch(e => this.server.log.error({ err: e }, 'Background google welcome email failed'));
        }

        return {
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                name: user.name,
                displayName: user.displayName || user.name,
                username: user.username,
                avatarUrl: user.avatarUrl,
                preferences: user.preferences
            },
            accessToken: session.accessToken,
            refreshToken: session.refreshToken,
            sessionId: session.sessionId,
            isNewUser
        };
    }

    async upgradeGuest(targetUserId: string, guestId: string) {
        if (!guestId || guestId === targetUserId) {
            return { message: 'No upgrade needed' };
        }

        const guest = await prisma.user.findUnique({ where: { id: guestId } });
        if (!guest) return { message: 'Guest account not found' };

        // Migrate likes
        const guestLikes = await prisma.like.findMany({ where: { userId: guestId } });
        for (const like of guestLikes) {
            await prisma.like.upsert({
                where: { userId_trackId: { userId: targetUserId, trackId: like.trackId } },
                create: { userId: targetUserId, trackId: like.trackId },
                update: {}
            }).catch(() => {});
        }

        // Migrate playlists
        await prisma.playlist.updateMany({
            where: { userId: guestId },
            data: { userId: targetUserId }
        });

        // Migrate listening events
        await prisma.listeningEvent.updateMany({
            where: { userId: guestId },
            data: { userId: targetUserId }
        }).catch(() => {});

        // Delete guest user
        await prisma.user.delete({ where: { id: guestId } }).catch(() => {});

        return { message: 'Guest account upgraded successfully' };
    }

    async disconnectGoogle(userId: string) {
        // Ensure user has at least one other identity or password
        const identities = await prisma.authIdentity.findMany({ where: { userId } });
        const user = await prisma.user.findUnique({ where: { id: userId } });

        const hasEmailIdentity = identities.some(i => i.provider === 'email');
        const hasPassword = !!user?.password;

        if (!hasEmailIdentity && !hasPassword && identities.length <= 1) {
            throw this.server.httpErrors.badRequest('Cannot disconnect Google because it is your only sign-in method.');
        }

        await prisma.authIdentity.deleteMany({
            where: { userId, provider: 'google' }
        });

        await prisma.user.update({
            where: { id: userId },
            data: { googleId: null }
        });

        return { message: 'Google account disconnected successfully' };
    }

    async exportUserData(userId: string) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: {
                preferences: true,
                playlists: { include: { tracks: { include: { track: true } } } },
                likes: { include: { track: true } },
                followedArtists: true,
                listeningEvents: { take: 500, orderBy: { startedAt: 'desc' } },
                stats: true
            }
        });

        if (!user) throw this.server.httpErrors.notFound('User not found');
        const { password, ...safeData } = user;
        return safeData;
    }

    async deleteAccount(userId: string) {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw this.server.httpErrors.notFound('User not found');

        const email = user.email;

        try {
            await prisma.session.deleteMany({ where: { userId } });
            await prisma.refreshToken.deleteMany({ where: { userId } });
            await prisma.authIdentity.deleteMany({ where: { userId } });
            await prisma.listeningEvent.deleteMany({ where: { userId } });
            await prisma.listeningEventArtist.deleteMany({ where: { userId } });
            await prisma.userArtistStat.deleteMany({ where: { userId } });
            await prisma.userHourlyStat.deleteMany({ where: { userId } });
            await prisma.transaction.deleteMany({ where: { userId } });
            await prisma.playlist.deleteMany({ where: { userId } });
            await prisma.like.deleteMany({ where: { userId } });
            await prisma.artistFollow.deleteMany({ where: { userId } });
            await prisma.track.updateMany({ where: { userId }, data: { userId: null } });

            await prisma.user.delete({ where: { id: userId } });
        } catch (error: any) {
            this.server.log.error({ err: error }, 'Failed to delete user records');
            throw this.server.httpErrors.internalServerError('Failed to delete user data due to constraints.');
        }

        try {
            await MailService.sendAccountDeleted(email);
        } catch (e) {
            this.server.log.error({ err: e }, 'Failed to send account deletion email');
        }

        return { message: 'Account deleted successfully' };
    }

    async updatePreferences(userId: string, prefData: any) {
        // Filter out fields that belong to the User model or metadata
        const { displayName, name, id, userId: _ui, createdAt, updatedAt, ...preferences } = prefData;
        const userName = displayName || name;

        const ALLOWED_PREF_KEYS = new Set([
            'onboardingCompleted', 'onboardingCompletedAt', 'preferredGenres', 'languages',
            'favoriteArtists', 'audioQuality', 'crossfade', 'autoplay', 'normalizeVolume',
            'explicitFilter', 'theme', 'accentColor', 'globalPlayerStyle', 'sidebarStyle',
            'fullviewReactiveBg', 'trackPageReactiveBg', 'compactMode', 'emailNotifications',
            'newReleaseAlerts', 'playlistUpdates', 'weeklySummaryEmail', 'privateSession',
            'listeningActivity', 'surroundingSpeed', 'bottomNavStyle', 'swipeNavigation',
            'selectedCountryCode', 'selectedCountryName', 'selectedLanguageCode', 'selectedLanguageName'
        ]);

        const sanitizedPreferences: any = {};
        for (const [k, v] of Object.entries(preferences)) {
            if (ALLOWED_PREF_KEYS.has(k)) {
                sanitizedPreferences[k] = v;
            }
        }

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
                    data: sanitizedPreferences
                });
            } else {
                return await (prisma as any).userPreferences.create({
                    data: {
                        userId,
                        ...sanitizedPreferences
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
            await this.verifyOTP(emailKey, data.otp);
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

        // OTP Verification with attempt rate-limiting
        await this.verifyOTP(emailKey, data.otp);

        const hashedPassword = await hashPassword(data.password);
        await prisma.user.update({
            where: { id: user.id },
            data: { password: hashedPassword }
        });

        return { message: 'Password reset successfully' };
    }
}
