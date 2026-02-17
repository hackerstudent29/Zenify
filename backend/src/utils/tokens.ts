import { FastifyInstance } from 'fastify';
import { User, Role } from '@prisma/client';
import { config } from '../config/env';

export interface TokenPayload {
    id: string;
    email: string;
    role: Role;
}

export function generateAccessToken(server: FastifyInstance, payload: TokenPayload): string {
    return server.jwt.sign(payload, { expiresIn: '15m' });
}

export function generateRefreshToken(server: FastifyInstance, payload: TokenPayload): string {
    // Use a separate secret or signing method if configured, but for now reuse jwt with longer expiry
    // In a real prod setup, we might want separate secrets
    return server.jwt.sign(payload, { expiresIn: '7d' });
}
