import { Button, CheckboxField, TextareaField } from '../components/ui/FormControls'
import { useEffect, useState } from 'react'
import { Bot, Save } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { WorkspaceState } from '../components/ui/WorkspaceState'
import { ApiError, api, type AssistantSettingsDto } from '../lib/api/client'
import './AssistantSettingsWorkspace.css'

export function AssistantSettingsWorkspace() {
  const { t } = useTranslation()
  const [settings, setSettings] = useState<AssistantSettingsDto | null>(null)
  const [enabled, setEnabled] = useState(false)
  const [systemPrompt, setSystemPrompt] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let active = true
    api.agents.getAssistantSettings().then((result) => {
      if (!active) return
      setSettings(result)
      setEnabled(result.enabled)
      setSystemPrompt(result.systemPrompt)
    }).catch(() => { if (active) setError(t('assistantSettings.loadFailed')) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [t])

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const result = await api.agents.saveAssistantSettings({ enabled, systemPrompt })
      setSettings(result)
      setSaved(true)
    } catch (requestError) {
      setError(enabled && systemPrompt.trim().length < 100 ? t('assistantSettings.promptRequired') : requestError instanceof ApiError && requestError.code === 'ASSISTANT_RUNTIME_NOT_CONFIGURED' ? t('assistantSettings.runtimeMissing') : t('assistantSettings.saveFailed'))
    } finally { setSaving(false) }
  }

  return <section className="assistant-settings-page">
    <header className="assistant-settings-heading"><div><p className="eyebrow">{t('assistantSettings.eyebrow')}</p><h2>{t('assistantSettings.title')}</h2><p className="muted">{t('assistantSettings.description')}</p></div></header>
    {loading ? <WorkspaceState kind="loading" message={t('common.loading')} /> : !settings ? <WorkspaceState kind="error" message={error || t('assistantSettings.loadFailed')} /> : <form className="assistant-settings-panel" onSubmit={save}>
      <div className="assistant-settings-model"><Bot size={20} /><div><strong>{t('assistantSettings.model')}</strong><span>{settings?.model ?? 'claude-haiku-5-5'}</span></div></div>
      <label className="assistant-settings-toggle"><CheckboxField checked={enabled} onChange={(event) => { setEnabled(event.target.checked); setSaved(false) }} /><span><strong>{t('assistantSettings.enabled')}</strong><small>{t('assistantSettings.enabledHint')}</small></span></label>
      <label className="assistant-settings-prompt"><span><strong>{t('assistantSettings.prompt')}</strong><small>{t('assistantSettings.promptHint')}</small></span><TextareaField value={systemPrompt} onChange={(event) => { setSystemPrompt(event.target.value); setSaved(false) }} maxLength={30000} rows={16} /></label>
      <div className="assistant-settings-footer"><span>{t('assistantSettings.characters', { count: systemPrompt.length })}</span><Button className="primary" type="submit" disabled={saving}>{saving ? t('assistantSettings.saving') : <><Save size={15} />{t('assistantSettings.save')}</>}</Button></div>
      {error && <WorkspaceState kind="error" compact message={error} />}{saved && <p className="success-message" role="status">{t('assistantSettings.saved')}</p>}
      <p className="assistant-settings-runtime">{t(settings?.runtimeAvailable ? 'assistantSettings.runtimeReady' : 'assistantSettings.runtimeMissing')}</p>
    </form>}
  </section>
}
