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
    oldPassword: z.string().optional(),
    newPassword: z.string().min(8),
    otp: z.string().optional(),
});

export const googleLoginSchema = z.object({
    code: z.string().optional(),
    idToken: z.string().optional(),
    deviceId: z.string().optional(),
    deviceName: z.string().optional(),
    platform: z.string().optional(),
    appVersion: z.string().optional(),
}).refine(data => !!(data.code || data.idToken), {
    message: "Either 'code' or 'idToken' must be provided",
});

export const otpRequestSchema = z.object({
    email: z.string().email(),
});

export const otpVerifySchema = z.object({
    email: z.string().email(),
    code: z.string().min(6).max(6),
    deviceId: z.string().optional(),
    deviceName: z.string().optional(),
    platform: z.string().optional(),
    appVersion: z.string().optional(),
});

export const upgradeGuestSchema = z.object({
    guestId: z.string().optional(),
    guestToken: z.string().optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdatePasswordInput = z.infer<typeof updatePasswordSchema>;
export type GoogleLoginInput = z.infer<typeof googleLoginSchema>;
export type OtpRequestInput = z.infer<typeof otpRequestSchema>;
export type OtpVerifyInput = z.infer<typeof otpVerifySchema>;
export type UpgradeGuestInput = z.infer<typeof upgradeGuestSchema>;
