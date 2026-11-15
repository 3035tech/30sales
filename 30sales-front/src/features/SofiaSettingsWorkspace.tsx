import { useEffect, useState } from 'react'
import { Bot, Save } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ApiError, api, type SofiaSettingsDto } from '../lib/api/client'
import './SofiaSettingsWorkspace.css'

export function SofiaSettingsWorkspace() {
  const { t } = useTranslation()
  const [settings, setSettings] = useState<SofiaSettingsDto | null>(null)
  const [enabled, setEnabled] = useState(false)
  const [systemPrompt, setSystemPrompt] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let active = true
    api.agents.getSofiaSettings().then((result) => {
      if (!active) return
      setSettings(result)
      setEnabled(result.enabled)
      setSystemPrompt(result.systemPrompt)
    }).catch(() => { if (active) setError(t('sofiaSettings.loadFailed')) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [t])

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const result = await api.agents.saveSofiaSettings({ enabled, systemPrompt })
      setSettings(result)
      setSaved(true)
    } catch (requestError) {
      setError(enabled && systemPrompt.trim().length < 100 ? t('sofiaSettings.promptRequired') : requestError instanceof ApiError && requestError.code === 'SOFIA_RUNTIME_NOT_CONFIGURED' ? t('sofiaSettings.runtimeMissing') : t('sofiaSettings.saveFailed'))
    } finally { setSaving(false) }
  }

  return <section className="sofia-settings-page">
    <header className="sofia-settings-heading"><div><p className="eyebrow">{t('sofiaSettings.eyebrow')}</p><h2>{t('sofiaSettings.title')}</h2><p className="muted">{t('sofiaSettings.description')}</p></div></header>
    {loading ? <p className="notice">{t('common.loading')}</p> : <form className="sofia-settings-panel" onSubmit={save}>
      <div className="sofia-settings-model"><Bot size={20} /><div><strong>{t('sofiaSettings.model')}</strong><span>{settings?.model ?? 'claude-haiku-5-5'}</span></div></div>
      <label className="sofia-settings-toggle"><input type="checkbox" checked={enabled} onChange={(event) => { setEnabled(event.target.checked); setSaved(false) }} /><span><strong>{t('sofiaSettings.enabled')}</strong><small>{t('sofiaSettings.enabledHint')}</small></span></label>
      <label className="sofia-settings-prompt"><span><strong>{t('sofiaSettings.prompt')}</strong><small>{t('sofiaSettings.promptHint')}</small></span><textarea value={systemPrompt} onChange={(event) => { setSystemPrompt(event.target.value); setSaved(false) }} maxLength={30000} rows={16} /></label>
      <div className="sofia-settings-footer"><span>{t('sofiaSettings.characters', { count: systemPrompt.length })}</span><button className="primary" type="submit" disabled={saving}>{saving ? t('sofiaSettings.saving') : <><Save size={15} />{t('sofiaSettings.save')}</>}</button></div>
      {error && <p className="error" role="alert">{error}</p>}{saved && <p className="success-message" role="status">{t('sofiaSettings.saved')}</p>}
      <p className="sofia-settings-runtime">{t(settings?.runtimeAvailable ? 'sofiaSettings.runtimeReady' : 'sofiaSettings.runtimeMissing')}</p>
    </form>}
  </section>
}
