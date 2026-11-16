import { z } from 'zod';
const envSchema = z.object({
 NODE_ENV: z.enum(['development','test','production']).default('development'), PORT: z.coerce.number().int().positive().default(3000), DATABASE_URL: z.string().min(1), BETTER_AUTH_SECRET: z.string().min(32), BETTER_AUTH_URL: z.string().url().default('http://localhost:3000'), FRONTEND_URL: z.string().url().default('http://localhost:5173'), SMTP_HOST: z.string().optional(), SMTP_PORT: z.coerce.number().int().positive().default(587), SMTP_SECURE: z.enum(['true','false']).default('false').transform(value => value === 'true'), SMTP_USER: z.string().optional(), SMTP_PASSWORD: z.string().optional(), SMTP_FROM: z.string().email().optional(), CHANNEL_CREDENTIALS_ENCRYPTION_KEY: z.string().optional(), AWS_REGION: z.string().min(1).default('eu-west-1'), MEDIA_S3_BUCKET: z.string().min(3).optional(), ANTHROPIC_API_KEY: z.string().optional(), OPENAI_API_KEY: z.string().optional(), META_GRAPH_API_VERSION: z.string().regex(/^v\d+\.0$/).default('v27.0'), META_APP_SECRET: z.string().optional(), META_WEBHOOK_VERIFY_TOKEN: z.string().optional()
}).superRefine((value, ctx) => {
 if (value.NODE_ENV === 'production' && (!value.SMTP_HOST || !value.SMTP_FROM)) ctx.addIssue({ code: 'custom', message: 'SMTP_HOST and SMTP_FROM are required in production', path: ['SMTP_HOST'] });
 if (value.NODE_ENV === 'production' && !value.CHANNEL_CREDENTIALS_ENCRYPTION_KEY) ctx.addIssue({ code: 'custom', message: 'CHANNEL_CREDENTIALS_ENCRYPTION_KEY is required in production', path: ['CHANNEL_CREDENTIALS_ENCRYPTION_KEY'] });
 if (value.NODE_ENV === 'production' && !value.MEDIA_S3_BUCKET) ctx.addIssue({ code: 'custom', message: 'MEDIA_S3_BUCKET is required in production', path: ['MEDIA_S3_BUCKET'] });
 if (value.CHANNEL_CREDENTIALS_ENCRYPTION_KEY) {
  const key = Buffer.from(value.CHANNEL_CREDENTIALS_ENCRYPTION_KEY, 'base64');
  if (key.length !== 32 || key.toString('base64').replace(/=+$/, '') !== value.CHANNEL_CREDENTIALS_ENCRYPTION_KEY.replace(/=+$/, '')) ctx.addIssue({ code: 'custom', message: 'CHANNEL_CREDENTIALS_ENCRYPTION_KEY must be base64 for exactly 32 bytes', path: ['CHANNEL_CREDENTIALS_ENCRYPTION_KEY'] });
 }
});
export const env = envSchema.parse(process.env);
