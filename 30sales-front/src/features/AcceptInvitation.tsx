import { useEffect, useState } from 'react'
import { ArrowRight, Check, Command } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { api, type InvitationDto } from '../lib/api/client'
import { roleNames } from '../lib/permissions'

export function AcceptInvitation() {
  const { t } = useTranslation()
  const invitationId = new URLSearchParams(window.location.search).get('id') ?? ''
  const [invite, setInvite] = useState<InvitationDto | null>(null)
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(t('invitation.loading'))
  const [error, setError] = useState('')
  const [hasSession, setHasSession] = useState(false)
  const [verified, setVerified] = useState(false)
  const [loginMode, setLoginMode] = useState(false)

  useEffect(() => {
    let mounted = true
    void (async () => {
      if (!invitationId) { setMessage(''); setError(t('invitation.invalidLink')); return }
      const [inviteResult, sessionResult] = await Promise.all([api.auth.getInvitation(invitationId), api.auth.getSession()])
      if (!mounted) return
      if (inviteResult.error || !inviteResult.data) { setMessage(''); setError(t('invitation.unavailable')); return }
      setInvite(inviteResult.data)
      const user = sessionResult.data?.user
      if (!user) { setMessage(''); return }
      setHasSession(true)
      setVerified(Boolean(user.emailVerified))
      if (!user.emailVerified) { setMessage(t('invitation.confirmEmail')); return }
      const accepted = await api.auth.acceptInvitation(invitationId)
      if (!mounted) return
      if (accepted.error) { setMessage(''); setError(t('invitation.acceptFailed')); return }
      setMessage(t('invitation.accepted'))
      window.location.replace('/')
    })()
    return () => { mounted = false }
  }, [invitationId, t])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!invite) return
    setBusy(true)
    setError('')
    if (loginMode) {
      const result = await api.auth.signInEmail({ email: invite.email, password, callbackURL: window.location.href })
      setBusy(false)
      if (result.error) { setError(t('invitation.signInFailed')); return }
      window.location.reload()
      return
    }
    const result = await api.auth.signUpEmail({ name, email: invite.email, password, callbackURL: window.location.href })
    setBusy(false)
    if (result.error) { setError(t('invitation.createFailed')); return }
    setMessage(t('invitation.verificationSent'))
  }

  const roleName = roleNames.find((candidate) => candidate === invite?.role)
  const organizationName = invite?.organization?.name ?? invite?.organizationName ?? t('invitation.fallbackTitle')
  return <main className="invite-shell"><section className="invite-card">
    <div className="invite-brand"><img src="/brand-kit/logos/logo-default.svg" alt="30Sales" /></div><span className="welcome-icon"><Command size={23} /></span>
    <p className="eyebrow">{t('invitation.eyebrow')}</p><h1>{organizationName}</h1>
    {invite ? <p className="muted">{t('invitation.description', { role: roleName ? t(`roles.${roleName}`) : invite.role, email: invite.email })}</p> : <p className="muted">{message}</p>}
    {message && invite && <p className="invite-status">{message}</p>}
    {invite && !hasSession && !message && <form className="login-form" onSubmit={submit}>
      {!loginMode && <label>{t('invitation.yourName')}<input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required /></label>}
      <label>{t('invitation.invitedEmail')}<input type="email" value={invite.email} readOnly /></label>
      <label>{t('invitation.password')}<input type="password" autoComplete={loginMode ? 'current-password' : 'new-password'} minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
      <button className="primary" disabled={busy}>{busy ? t('invitation.signingIn') : loginMode ? t('invitation.signInAccept') : t('invitation.createAccount')}<ArrowRight size={16} /></button>
      <button type="button" className="text-button" onClick={() => { setLoginMode(!loginMode); setError('') }}>{loginMode ? t('invitation.newAccount') : t('invitation.existingAccount')}</button>
    </form>}
    {hasSession && verified && !error && <span className="invite-status"><Check size={15} />{t('invitation.accessConfirmed')}</span>}
    {error && <p className="error">{error}</p>}
    <p className="invite-footnote">{t('invitation.footnote')}</p>
  </section></main>
}
