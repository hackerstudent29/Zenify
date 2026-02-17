import { PrismaClient } from '@prisma/client';
import { config } from '../config/env';

declare global {
    var prisma: PrismaClient | undefined;
}

export const prisma = global.prisma || new PrismaClient();

if (config.NODE_ENV !== 'production') {
    global.prisma = prisma;
}
