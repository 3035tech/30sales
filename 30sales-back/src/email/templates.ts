import { env } from '../config/env';
import { sendProductEmail } from './mailer';
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
export async function sendInvitationEmail(data: { id: string; email: string; inviter: { user: { name: string; email: string } }; organization: { name: string } }) {
 const link = new URL(`/accept-invitation?id=${encodeURIComponent(data.id)}`, env.FRONTEND_URL).toString();
 const company = escapeHtml(data.organization.name); const inviter = escapeHtml(data.inviter.user.name);
 await sendProductEmail({ to: data.email, subject: `Convite para ${data.organization.name} no 30Sales`, text: `${data.inviter.user.name} convidou você para ${data.organization.name} no 30Sales. Aceite: ${link}`, html: `<p>${inviter} convidou você para acessar <strong>${company}</strong> no 30Sales.</p><p><a href="${link}">Aceitar convite</a></p><p>Se você não esperava este convite, ignore esta mensagem.</p>` });
}
export async function sendVerificationEmail(data: { user: { email: string; name: string }; url: string }) {
 await sendProductEmail({ to: data.user.email, subject: 'Confirme seu e-mail do 30Sales', text: `Olá ${data.user.name}. Confirme seu e-mail: ${data.url}`, html: `<p>Olá ${escapeHtml(data.user.name)}.</p><p><a href="${data.url}">Confirmar e-mail</a></p>` });
}
export async function sendPasswordResetEmail(data: { user: { email: string; name: string }; url: string }) {
 await sendProductEmail({ to: data.user.email, subject: 'Redefina sua senha do 30Sales', text: `Olá ${data.user.name}. Para redefinir sua senha, acesse: ${data.url}. Se você não solicitou esta alteração, ignore esta mensagem.`, html: `<p>Olá ${escapeHtml(data.user.name)}.</p><p><a href="${data.url}">Redefinir senha</a></p><p>Se você não solicitou esta alteração, ignore esta mensagem.</p>` });
}
