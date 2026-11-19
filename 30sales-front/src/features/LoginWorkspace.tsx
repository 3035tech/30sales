import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowRight } from 'lucide-react'
import { Button, CheckboxField, TextField } from '../components/ui/FormControls'
import { api } from '../lib/api'

export function LoginWorkspace({ onError }: { onError: (message: string) => void }) {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(true)
  const [busy, setBusy] = useState(false)
  const [requestingReset, setRequestingReset] = useState(false)
  const [resetRequested, setResetRequested] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    onError('')
    try {
      if (requestingReset) {
        const result = await api.auth.requestPasswordReset({ email, redirectTo: `${window.location.origin}/reset-password` })
        if (result.error) onError(t('auth.resetRequestFailed'))
        else setResetRequested(true)
        return
      }
      const result = await api.auth.signInEmail({ email, password, rememberMe })
      if (result.error) onError(t('auth.failedSignIn'))
      else window.location.reload()
    } catch {
      onError(requestingReset ? t('auth.resetRequestFailed') : t('auth.failedSignIn'))
    } finally {
      setBusy(false)
    }
  }
  return <>
    <h1 id="access-title">{requestingReset ? t('auth.resetRequestTitle') : t('home.signInTitle')}</h1>
    <p className="muted">{requestingReset ? t('auth.resetRequestHint') : t('home.signInHint')}</p>
    {requestingReset ? resetRequested ? <div className="auth-reset-confirmation" role="status">
      <p>{t('auth.resetRequestSent')}</p>
      <Button type="button" className="text-button" onClick={() => { setRequestingReset(false); setResetRequested(false); onError('') }}>{t('auth.backToSignIn')}</Button>
    </div> : <form className="login-form" onSubmit={submit}>
      <label>{t('common.email')}<TextField type="email" normalize="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
      <Button className="primary" disabled={busy}>{busy ? t('auth.sendingResetLink') : t('auth.sendResetLink')}<ArrowRight size={16} /></Button>
      <Button type="button" className="text-button" onClick={() => { setRequestingReset(false); onError('') }}>{t('auth.backToSignIn')}</Button>
    </form> : <form className="login-form" onSubmit={submit}>
      <label>{t('common.email')}<TextField type="email" normalize="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
      <label>{t('auth.password')}<TextField type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
      <div className="login-options"><label className="remember-option"><CheckboxField checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} />{t('auth.rememberMe')}</label><Button type="button" className="text-button" onClick={() => { setRequestingReset(true); onError('') }}>{t('auth.forgotPassword')}</Button></div>
      <Button className="primary" disabled={busy}>{busy ? t('auth.signingIn') : t('auth.signIn')}<ArrowRight size={16} /></Button>
    </form>}
  </>
}
