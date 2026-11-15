import { z } from 'zod';
import path from 'node:path';
const envSchema = z.object({
 NODE_ENV: z.enum(['development','test','production']).default('development'), PORT: z.coerce.number().int().positive().default(3000), DATABASE_URL: z.string().min(1), BETTER_AUTH_SECRET: z.string().min(32), BETTER_AUTH_URL: z.string().url().default('http://localhost:3000'), FRONTEND_URL: z.string().url().default('http://localhost:5173'), SMTP_HOST: z.string().optional(), SMTP_PORT: z.coerce.number().int().positive().default(587), SMTP_SECURE: z.enum(['true','false']).default('false').transform(value => value === 'true'), SMTP_USER: z.string().optional(), SMTP_PASSWORD: z.string().optional(), SMTP_FROM: z.string().email().optional(), CHANNEL_CREDENTIALS_ENCRYPTION_KEY: z.string().optional(), MEDIA_STORAGE_DIR: z.string().min(1).default(path.resolve(process.cwd(), 'var', 'media')), ANTHROPIC_API_KEY: z.string().optional(), META_GRAPH_API_VERSION: z.string().regex(/^v\d+\.0$/).default('v27.0'), META_APP_SECRET: z.string().optional(), META_WEBHOOK_VERIFY_TOKEN: z.string().optional()
}).superRefine((value, ctx) => {
 if (value.NODE_ENV === 'production' && (!value.SMTP_HOST || !value.SMTP_FROM)) ctx.addIssue({ code: 'custom', message: 'SMTP_HOST and SMTP_FROM are required in production', path: ['SMTP_HOST'] });
 if (value.NODE_ENV === 'production' && !value.CHANNEL_CREDENTIALS_ENCRYPTION_KEY) ctx.addIssue({ code: 'custom', message: 'CHANNEL_CREDENTIALS_ENCRYPTION_KEY is required in production', path: ['CHANNEL_CREDENTIALS_ENCRYPTION_KEY'] });
 const mediaStoragePath = path.resolve(value.MEDIA_STORAGE_DIR);
 const temporaryStorageRoots = ['/tmp', '/private/tmp', '/var/tmp', '/dev/shm'];
 if (value.NODE_ENV === 'production' && (!process.env.MEDIA_STORAGE_DIR || temporaryStorageRoots.some((root) => mediaStoragePath === root || mediaStoragePath.startsWith(`${root}${path.sep}`)))) ctx.addIssue({ code: 'custom', message: 'MEDIA_STORAGE_DIR must point to a durable shared volume in production', path: ['MEDIA_STORAGE_DIR'] });
 if (!path.isAbsolute(value.MEDIA_STORAGE_DIR)) ctx.addIssue({ code: 'custom', message: 'MEDIA_STORAGE_DIR must be an absolute path', path: ['MEDIA_STORAGE_DIR'] });
 if (value.CHANNEL_CREDENTIALS_ENCRYPTION_KEY) {
  const key = Buffer.from(value.CHANNEL_CREDENTIALS_ENCRYPTION_KEY, 'base64');
  if (key.length !== 32 || key.toString('base64').replace(/=+$/, '') !== value.CHANNEL_CREDENTIALS_ENCRYPTION_KEY.replace(/=+$/, '')) ctx.addIssue({ code: 'custom', message: 'CHANNEL_CREDENTIALS_ENCRYPTION_KEY must be base64 for exactly 32 bytes', path: ['CHANNEL_CREDENTIALS_ENCRYPTION_KEY'] });
 }
});
export const env = envSchema.parse(process.env);
