import { FastifyInstance } from 'fastify';
import { prisma } from '../utils/prisma';
import { hashPassword, verifyPassword } from '../utils/hash';
import { generateAccessToken, generateRefreshToken } from '../utils/tokens';
import { RegisterInput, LoginInput } from '../controllers/auth.schemas';

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
                token: refreshToken,
                userId: user.id,
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
            },
        });

        return { user: { id: user.id, email: user.email, role: user.role }, accessToken, refreshToken };
    }

    async login(data: LoginInput) {
        const user = await prisma.user.findUnique({ where: { email: data.email } });
        if (!user) throw this.server.httpErrors.unauthorized('Invalid email or password');

        const isValid = await verifyPassword(data.password, user.password);
        if (!isValid) throw this.server.httpErrors.unauthorized('Invalid email or password');

        const payload = { id: user.id, email: user.email, role: user.role };
        const accessToken = generateAccessToken(this.server, payload);
        const refreshToken = generateRefreshToken(this.server, payload);

        await prisma.refreshToken.create({
            data: {
                token: refreshToken,
                userId: user.id,
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            },
        });

        return { user: { id: user.id, email: user.email, role: user.role }, accessToken, refreshToken };
    }

    async logout(refreshToken: string) {
        await prisma.refreshToken.update({
            where: { token: refreshToken },
            data: { revoked: true }
        }).catch(() => { /* Ignore if not found */ });
    }

    async refresh(refreshToken: string) {
        const storedToken = await prisma.refreshToken.findUnique({
            where: { token: refreshToken },
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
                token: newRefreshToken,
                userId: storedToken.userId,
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            },
        });

        return { accessToken: newAccessToken, refreshToken: newRefreshToken };
    }
}
