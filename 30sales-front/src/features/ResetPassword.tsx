import { Button, TextField } from '../components/ui/FormControls'
import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'

export function ResetPassword() {
  const { t } = useTranslation()
  const params = new URLSearchParams(window.location.search)
  const token = params.get('token') ?? ''
  const invalidLink = !token || params.has('error')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [complete, setComplete] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (password !== confirmation) {
      setError(t('auth.passwordsDoNotMatch'))
      return
    }
    setBusy(true)
    setError('')
    try {
      const result = await api.auth.resetPassword({ newPassword: password, token })
      if (result.error) setError(t('auth.resetPasswordFailed'))
      else setComplete(true)
    } catch {
      setError(t('auth.resetPasswordFailed'))
    } finally {
      setBusy(false)
    }
  }

  return <main className="access-shell">
    <section className="access-card" aria-labelledby="reset-title">
      <div className="access-brand"><img src="/brand-kit/logos/logo-default.svg" alt="30Sales" /></div>
      <p className="eyebrow">{t('home.accessEyebrow')}</p>
      <h1 id="reset-title">{t('auth.resetTitle')}</h1>
      <p className="muted">{t('auth.resetHint')}</p>
      {complete ? <div className="auth-reset-confirmation" role="status">
        <p>{t('auth.resetPasswordSuccess')}</p>
        <a className="text-button" href="/">{t('auth.backToSignIn')}</a>
      </div> : invalidLink ? <div className="auth-reset-confirmation" role="alert">
        <p>{t('auth.invalidResetLink')}</p>
        <a className="text-button" href="/">{t('auth.backToSignIn')}</a>
      </div> : <form className="login-form" onSubmit={submit}>
        <label>{t('auth.newPassword')}<TextField type="password" autoComplete="new-password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
        <label>{t('auth.confirmPassword')}<TextField type="password" autoComplete="new-password" minLength={8} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required /></label>
        <Button className="primary" disabled={busy}>{busy ? t('auth.resettingPassword') : t('auth.resetPassword')}<ArrowRight size={16} /></Button>
        {error && <p className="access-error" role="alert">{error}</p>}
      </form>}
    </section>
  </main>
}
