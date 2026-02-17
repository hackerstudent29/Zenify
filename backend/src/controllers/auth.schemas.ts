import { z } from 'zod';

export const registerSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
    role: z.enum(['ADMIN', 'LISTENER']).optional(),
});

export const loginSchema = z.object({
    email: z.string().email(),
    password: z.string(),
});

export const refreshSchema = z.object({});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
