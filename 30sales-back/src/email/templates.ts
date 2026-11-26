import { env } from '../config/env';
import { sendProductEmail } from './mailer';

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);

function renderEmail(input: { preheader: string; greeting: string; message: string; actionLabel: string; actionUrl: string; footer: string }) {
 const preheader = escapeHtml(input.preheader);
 const greeting = escapeHtml(input.greeting);
 const message = escapeHtml(input.message);
 const actionLabel = escapeHtml(input.actionLabel);
 const footer = escapeHtml(input.footer);
 const actionUrl = escapeHtml(input.actionUrl);
 return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f4f7fb;color:#172235;font-family:Arial,Helvetica,sans-serif"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${preheader}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7fb;padding:32px 12px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fff;border:1px solid #e2e8f0;border-radius:14px"><tr><td style="padding:28px 32px 18px;border-bottom:1px solid #edf1f5"><span style="font-size:22px;font-weight:700;letter-spacing:-1px;color:#172235">30<span style="color:#177850">›</span> sales</span></td></tr><tr><td style="padding:28px 32px 12px"><h1 style="margin:0 0 18px;font-size:22px;line-height:1.3;color:#172235">${greeting}</h1><p style="margin:0;color:#46566b;font-size:15px;line-height:1.7">${message}</p><table role="presentation" cellspacing="0" cellpadding="0" style="margin:26px 0 22px"><tr><td bgcolor="#177850" style="border-radius:8px"><a href="${actionUrl}" style="display:inline-block;padding:13px 20px;border:1px solid #177850;border-radius:8px;background:#177850;color:#fff;font-size:15px;font-weight:700;text-decoration:none">${actionLabel}</a></td></tr></table><p style="margin:0 0 8px;color:#718096;font-size:13px;line-height:1.6">Se o botão não funcionar, copie e cole este endereço no navegador:</p><p style="margin:0 0 22px;word-break:break-all;font-size:12px;line-height:1.6"><a href="${actionUrl}" style="color:#205dd1">${actionUrl}</a></p><p style="margin:0;color:#718096;font-size:13px;line-height:1.6">${footer}</p></td></tr><tr><td style="padding:18px 32px 24px;border-top:1px solid #edf1f5;color:#8a97a8;font-size:12px;line-height:1.5">30Sales · Gestão comercial em um só lugar</td></tr></table></td></tr></table></body></html>`;
}

export async function sendInvitationEmail(data: { id: string; email: string; inviter: { user: { name: string; email: string } }; organization: { id: string; name: string } }) {
 const invitationUrl = new URL('/accept-invitation', env.FRONTEND_URL);
 invitationUrl.searchParams.set('id', data.id);
 invitationUrl.searchParams.set('organizationId', data.organization.id);
 const link = invitationUrl.toString();
 const company = data.organization.name;
 const inviter = data.inviter.user.name;
 const greeting = `Você foi convidado para ${company}`;
 const message = `${inviter} convidou você para acessar o workspace ${company} no 30Sales.`;
 const footer = 'Se você não esperava este convite, pode ignorar esta mensagem.';
 await sendProductEmail({ to: data.email, subject: `Convite para ${company} no 30Sales`, text: `${message} Aceite o convite: ${link}\n\n${footer}`, html: renderEmail({ preheader: message, greeting, message, actionLabel: 'Aceitar convite', actionUrl: link, footer }) });
}

export async function sendVerificationEmail(data: { user: { email: string; name: string }; url: string }) {
 const greeting = `Olá, ${data.user.name}`;
 const message = 'Confirme seu endereço de e-mail para concluir a configuração da sua conta no 30Sales.';
 const footer = 'Se você não criou uma conta no 30Sales, ignore esta mensagem.';
 await sendProductEmail({ to: data.user.email, subject: 'Confirme seu e-mail do 30Sales', text: `${greeting}. ${message} Confirme: ${data.url}\n\n${footer}`, html: renderEmail({ preheader: message, greeting, message, actionLabel: 'Confirmar e-mail', actionUrl: data.url, footer }) });
}

export async function sendPasswordResetEmail(data: { user: { email: string; name: string }; url: string }) {
 const greeting = `Olá, ${data.user.name}`;
 const message = 'Recebemos uma solicitação para redefinir a senha da sua conta do 30Sales.';
 const footer = 'Se você não solicitou esta alteração, ignore esta mensagem. Sua senha atual continuará funcionando.';
 await sendProductEmail({ to: data.user.email, subject: 'Redefina sua senha do 30Sales', text: `${greeting}. ${message} Redefina sua senha: ${data.url}\n\n${footer}`, html: renderEmail({ preheader: message, greeting, message, actionLabel: 'Redefinir senha', actionUrl: data.url, footer }) });
}
