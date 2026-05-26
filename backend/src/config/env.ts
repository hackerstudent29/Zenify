import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
    PORT: z.coerce.number().default(3000),
    DATABASE_URL: z.string(),
    JWT_SECRET: z.string(),
    REFRESH_TOKEN_SECRET: z.string(),
    GOOGLE_CLIENT_ID: z.string(),
    GOOGLE_CLIENT_SECRET: z.string(),
    REDIS_URL: z.string().optional(),
    CLOUDINARY_CLOUD_NAME: z.string().optional(),
    CLOUDINARY_API_KEY: z.string().optional(),
    CLOUDINARY_API_SECRET: z.string().optional(),
    NODE_ENV: z.enum(['development', 'production', 'test']).default(process.env.RAILWAY_ENVIRONMENT_NAME ? 'production' : 'development'),
    ZENWALLET_API_KEY: z.string(),
    ZENWALLET_PUBLIC_KEY: z.string().optional(),
    ZENWALLET_MERCHANT_ID: z.string().optional(),
    ZENWALLET_MERCHANT_JWT: z.string().optional(), // JWT token from ZenPay merchant login
    ZENWALLET_BASE_URL: z.string().default('http://localhost:4000/v1'),
    ZENWALLET_WEBHOOK_SECRET: z.string().optional(),
    FRONTEND_URL: z.string().default('http://localhost:3001'),
    SMTP_HOST: z.string().default('smtp.gmail.com'),
    SMTP_PORT: z.coerce.number().default(587),
    SMTP_USER: z.string(),
    SMTP_PASS: z.string(),
    SUPABASE_URL: z.string().optional(),
    SUPABASE_ANON_KEY: z.string().optional(),
    VERCEL_AI_KEY: z.string().optional(),
    NVIDIA_API_KEY: z.string().optional(),
    R2_ACCESS_KEY_ID: z.string().optional(),
    R2_SECRET_ACCESS_KEY: z.string().optional(),
    R2_ENDPOINT: z.string().optional(),
    R2_BUCKET_NAME: z.string().optional(),
    R2_PUBLIC_DOMAIN: z.string().optional(),
    BREVO_API_KEY: z.string().optional(),
    BREVO_FROM_EMAIL: z.string().optional().default('onboarding@brevo.com'),
    REPLICATE_API_TOKEN: z.string().optional(),
    HAPPI_API_KEY: z.string().optional(),
    QUICKLRC_API_KEY: z.string().optional(),
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
    console.error('❌ Invalid environment variables:', _env.error.format());
    throw new Error('Invalid environment variables');
}

export const config = _env.data;
