import { z } from 'zod';
const envSchema = z.object({
 NODE_ENV: z.enum(['development','test','production']).default('development'), PORT: z.coerce.number().int().positive().default(3000), DATABASE_URL: z.string().min(1), BETTER_AUTH_SECRET: z.string().min(32), BETTER_AUTH_URL: z.string().url().default('http://localhost:3000'), FRONTEND_URL: z.string().url().default('http://localhost:5173'), SMTP_HOST: z.string().optional(), SMTP_PORT: z.coerce.number().int().positive().default(587), SMTP_SECURE: z.enum(['true','false']).default('false').transform(value => value === 'true'), SMTP_USER: z.string().optional(), SMTP_PASSWORD: z.string().optional(), SMTP_FROM: z.string().email().optional()
}).superRefine((value, ctx) => {
 if (value.NODE_ENV === 'production' && (!value.SMTP_HOST || !value.SMTP_FROM)) ctx.addIssue({ code: 'custom', message: 'SMTP_HOST and SMTP_FROM are required in production', path: ['SMTP_HOST'] });
});
export const env = envSchema.parse(process.env);
