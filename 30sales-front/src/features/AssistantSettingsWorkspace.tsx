import { Button, CheckboxField, SelectField, TextareaField } from '../components/ui/FormControls'
import { useEffect, useState } from 'react'
import { Bot, RotateCcw, Save } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { WorkspaceState } from '../components/ui/WorkspaceState'
import { ApiError, api, type AssistantSettingsDto } from '../lib/api'
import type { BusinessLineDto } from '../lib/api'
import './AssistantSettingsWorkspace.css'

export function AssistantSettingsWorkspace() {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [settings, setSettings] = useState<AssistantSettingsDto | null>(null)
  const [businessLines, setBusinessLines] = useState<BusinessLineDto[]>([])
  const [businessLineId, setBusinessLineId] = useState<string | null>(null)
  const [enabled, setEnabled] = useState(false)
  const [model, setModel] = useState('claude-haiku-5-5')
  const [transcribeAudio, setTranscribeAudio] = useState(false)
  const [systemPrompt, setSystemPrompt] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => { setBusinessLineId(searchParams.get('businessLineId')) }, [searchParams])

  useEffect(() => {
    let active = true
    api.businessLines.list().then((result) => { if (active) setBusinessLines(result.data.filter((line) => line.status === 'active')) }).catch(() => undefined)
    setLoading(true)
    setSettings(null)
    setError('')
    api.agents.getAssistantSettings(businessLineId ?? undefined).then((result) => {
      if (!active) return
      setSettings(result)
      setEnabled(result.enabled)
      setModel(result.model)
      setTranscribeAudio(result.transcribeAudio)
      setSystemPrompt(result.systemPrompt)
    }).catch(() => { if (active) setError(t('assistantSettings.loadFailed')) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [businessLineId, t])

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const result = await api.agents.saveAssistantSettings({ businessLineId, enabled, model, transcribeAudio, systemPrompt })
      setSettings(result)
      setSaved(true)
    } catch (requestError) {
      setError(enabled && systemPrompt.trim().length < 100 ? t('assistantSettings.promptRequired') : requestError instanceof ApiError && requestError.code === 'ASSISTANT_TRANSCRIPTION_NOT_CONFIGURED' ? t('assistantSettings.transcriptionMissing') : requestError instanceof ApiError && requestError.code === 'ASSISTANT_RUNTIME_NOT_CONFIGURED' ? t('assistantSettings.runtimeMissing') : t('assistantSettings.saveFailed'))
    } finally { setSaving(false) }
  }

  const resetToOrganizationDefault = async () => {
    if (!businessLineId) return
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const result = await api.agents.resetBusinessLineSettings(businessLineId)
      setSettings(result)
      setEnabled(result.enabled)
      setModel(result.model)
      setTranscribeAudio(result.transcribeAudio)
      setSystemPrompt(result.systemPrompt)
      setSaved(true)
    } catch {
      setError(t('assistantSettings.resetFailed'))
    } finally {
      setSaving(false)
    }
  }

  return <section className="assistant-settings-page">
    <header className="assistant-settings-heading"><div><p className="eyebrow">{t('assistantSettings.eyebrow')}</p><h2>{t('assistantSettings.title')}</h2><p className="muted">{t('assistantSettings.description')}</p></div></header>
    {loading ? <WorkspaceState kind="loading" message={t('common.loading')} /> : !settings ? <WorkspaceState kind="error" message={error || t('assistantSettings.loadFailed')} /> : <form className="assistant-settings-panel" onSubmit={save}>
      <label className="assistant-settings-model"><span><strong>{t('assistantSettings.scope')}</strong><SelectField value={businessLineId ?? ''} onChange={(event) => { const nextLineId = event.target.value; setBusinessLineId(nextLineId || null); setSaved(false); setSearchParams((current) => { const next = new URLSearchParams(current); if (nextLineId) next.set('businessLineId', nextLineId); else next.delete('businessLineId'); return next }) }}><option value="">{t('assistantSettings.organizationDefault')}</option>{businessLines.map((line) => <option key={line.id} value={line.id}>{line.name}</option>)}</SelectField><small>{settings.inherited ? t('assistantSettings.inherited') : t('assistantSettings.scopeHint')}</small></span></label>
      <label className="assistant-settings-model"><Bot size={20} /><span><strong>{t('assistantSettings.model')}</strong><SelectField value={model} onChange={(event) => { setModel(event.target.value); setSaved(false) }}>{settings.availableModels.map((option) => <option key={option.id} value={option.id}>{option.name} · {option.provider}</option>)}</SelectField><small>{t('assistantSettings.modelHint')}</small></span></label>
      <label className="assistant-settings-toggle"><CheckboxField checked={enabled} onChange={(event) => { setEnabled(event.target.checked); setSaved(false) }} /><span><strong>{t('assistantSettings.enabled')}</strong><small>{t('assistantSettings.enabledHint')}</small></span></label>
      <label className="assistant-settings-toggle"><CheckboxField checked={transcribeAudio} onChange={(event) => { setTranscribeAudio(event.target.checked); setSaved(false) }} /><span><strong>{t('assistantSettings.transcribeAudio')}</strong><small>{t('assistantSettings.transcribeAudioHint')}</small></span></label>
      <label className="assistant-settings-prompt"><span><strong>{t('assistantSettings.prompt')}</strong><small>{t('assistantSettings.promptHint')}</small></span><TextareaField value={systemPrompt} onChange={(event) => { setSystemPrompt(event.target.value); setSaved(false) }} maxLength={30000} rows={16} /></label>
      <div className="assistant-settings-footer"><span>{t('assistantSettings.characters', { count: systemPrompt.length })}</span><div className="assistant-settings-actions">{businessLineId && !settings.inherited && <Button type="button" disabled={saving} onClick={resetToOrganizationDefault}><RotateCcw size={15} />{t('assistantSettings.resetToDefault')}</Button>}<Button className="primary" type="submit" disabled={saving}>{saving ? t('assistantSettings.saving') : <><Save size={15} />{t('assistantSettings.save')}</>}</Button></div></div>
      {error && <WorkspaceState kind="error" compact message={error} />}{saved && <p className="success-message" role="status">{t('assistantSettings.saved')}</p>}
      <p className="assistant-settings-runtime">{t(settings?.runtimeAvailable ? 'assistantSettings.runtimeReady' : 'assistantSettings.runtimeMissing')}</p>
      {transcribeAudio && <p className="assistant-settings-runtime">{t(settings.transcriptionAvailable ? 'assistantSettings.transcriptionReady' : 'assistantSettings.transcriptionMissing')}</p>}
    </form>}
  </section>
}
