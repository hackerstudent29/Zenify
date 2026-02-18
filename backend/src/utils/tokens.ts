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

import crypto from 'crypto';

export function generateRefreshToken(server: FastifyInstance, payload: TokenPayload): string {
    // Generate a secure random token
    return crypto.randomBytes(40).toString('hex');
}
