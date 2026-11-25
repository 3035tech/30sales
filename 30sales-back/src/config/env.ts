import { z } from 'zod';
const REDIS_URL_SCHEMES = ['redis:', 'rediss:'] as const;
const envSchema = z.object({
 NODE_ENV: z.enum(['development','test','production']).default('development'), PORT: z.coerce.number().int().positive().default(3000), DATABASE_URL: z.string().min(1), BETTER_AUTH_SECRET: z.string().min(32), BETTER_AUTH_URL: z.string().url().default('http://localhost:3000'), FRONTEND_URL: z.string().url().default('http://localhost:5173'), REDIS_URL: z.string().url().refine(value => REDIS_URL_SCHEMES.some(scheme => scheme === new URL(value).protocol)).optional(), AWS_ACCESS_KEY_ID: z.string().optional(), AWS_SECRET_ACCESS_KEY: z.string().optional(), CHANNEL_CREDENTIALS_ENCRYPTION_KEY: z.string().optional(), ANTHROPIC_API_KEY: z.string().optional(), OPENAI_API_KEY: z.string().optional(), META_GRAPH_API_VERSION: z.string().regex(/^v\d+\.0$/).default('v27.0'), META_APP_SECRET: z.string().optional(), META_WEBHOOK_VERIFY_TOKEN: z.string().optional()
}).superRefine((value, ctx) => {
 if (value.NODE_ENV === 'production' && !value.REDIS_URL) ctx.addIssue({ code: 'custom', message: 'REDIS_URL is required in production', path: ['REDIS_URL'] });
 if (value.NODE_ENV === 'production' && !value.CHANNEL_CREDENTIALS_ENCRYPTION_KEY) ctx.addIssue({ code: 'custom', message: 'CHANNEL_CREDENTIALS_ENCRYPTION_KEY is required in production', path: ['CHANNEL_CREDENTIALS_ENCRYPTION_KEY'] });
 if (Boolean(value.AWS_ACCESS_KEY_ID) !== Boolean(value.AWS_SECRET_ACCESS_KEY)) ctx.addIssue({ code: 'custom', message: 'AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be configured together', path: ['AWS_ACCESS_KEY_ID'] });
 if (value.CHANNEL_CREDENTIALS_ENCRYPTION_KEY) {
  const key = Buffer.from(value.CHANNEL_CREDENTIALS_ENCRYPTION_KEY, 'base64');
  if (key.length !== 32 || key.toString('base64').replace(/=+$/, '') !== value.CHANNEL_CREDENTIALS_ENCRYPTION_KEY.replace(/=+$/, '')) ctx.addIssue({ code: 'custom', message: 'CHANNEL_CREDENTIALS_ENCRYPTION_KEY must be base64 for exactly 32 bytes', path: ['CHANNEL_CREDENTIALS_ENCRYPTION_KEY'] });
 }
});
export const env = envSchema.parse(process.env);
