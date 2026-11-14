import nodemailer from 'nodemailer';
import { env } from '../config/env';

export async function sendProductEmail(input: { to: string; subject: string; text: string; html: string }): Promise<void> {
 if (!env.SMTP_HOST || !env.SMTP_FROM) throw new Error('Email delivery is not configured');
 const transport = nodemailer.createTransport({ host: env.SMTP_HOST, port: env.SMTP_PORT, secure: env.SMTP_SECURE, auth: env.SMTP_USER && env.SMTP_PASSWORD ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined, connectionTimeout: 10_000, socketTimeout: 15_000 });
 await transport.sendMail({ from: env.SMTP_FROM, to: input.to, subject: input.subject, text: input.text, html: input.html });
 await transport.close();
}
