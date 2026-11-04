import { PrismaClient } from '@prisma/client';
import { config } from '../config/env';

declare global {
    var prisma: PrismaClient | undefined;
}

function getOptimizedDatabaseUrl(): string | undefined {
    const rawUrl = process.env.DATABASE_URL || config.DATABASE_URL;
    if (!rawUrl) return undefined;

    try {
        const cleanUrl = rawUrl.trim().replace(/^["']|["']$/g, '');
        const parsed = new URL(cleanUrl);

        // Ensure SSL mode is set for cloud environments (Heroku Postgres, RDS)
        if (!parsed.searchParams.has('sslmode')) {
            parsed.searchParams.set('sslmode', 'no-verify');
        }

        // Heroku Essential tier has a hard ceiling of 20 connections across all clients.
        // Cap each node process to 5 (prod) or 3 (dev) so multiple dynos and local dev never trigger FATAL: too many connections.
        const maxSafeLimit = config.NODE_ENV === 'production' ? 5 : 3;
        const currentLimit = parseInt(parsed.searchParams.get('connection_limit') || '0', 10);
        if (currentLimit <= 0 || currentLimit > maxSafeLimit) {
            parsed.searchParams.set('connection_limit', String(maxSafeLimit));
        }

        // Increase pool timeout to 30s to allow brief traffic spikes without failing requests
        const currentPoolTimeout = parseInt(parsed.searchParams.get('pool_timeout') || '0', 10);
        if (currentPoolTimeout > 0 && currentPoolTimeout < 30) {
            parsed.searchParams.set('pool_timeout', '30');
        } else if (!parsed.searchParams.has('pool_timeout')) {
            parsed.searchParams.set('pool_timeout', '30');
        }

        if (!parsed.searchParams.has('connect_timeout')) {
            parsed.searchParams.set('connect_timeout', '15');
        }

        return parsed.toString();
    } catch {
        return rawUrl.trim().replace(/^["']|["']$/g, '');
    }
}

const dbUrl = getOptimizedDatabaseUrl();

export const prisma =
    global.prisma ||
    new PrismaClient({
        datasources: dbUrl
            ? {
                  db: {
                      url: dbUrl,
                  },
              }
            : undefined,
        log: config.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });

// Always retain singleton instance in global scope to prevent connection leaks across reload/re-imports
global.prisma = prisma;
