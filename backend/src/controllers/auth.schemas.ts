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

export const updatePasswordSchema = z.object({
    oldPassword: z.string(),
    newPassword: z.string().min(8),
});

export const googleLoginSchema = z.object({
    code: z.string(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdatePasswordInput = z.infer<typeof updatePasswordSchema>;
export type GoogleLoginInput = z.infer<typeof googleLoginSchema>;
