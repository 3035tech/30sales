import { Button, CheckboxField, IconButton, SelectField, TextareaField, TextField } from '../components/ui/FormControls'
import { useEffect, useState } from 'react'
import { Bot, Pencil, Plus, RotateCcw, Save, Trash2, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { WorkspaceState } from '../components/ui/WorkspaceState'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { ApiError, api, type AssistantProfileDto, type AssistantSettingsDto } from '../lib/api'
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
  const [profiles, setProfiles] = useState<AssistantProfileDto[]>([])
  const [profileDraft, setProfileDraft] = useState<Omit<AssistantProfileDto, 'id' | 'availableModels' | 'updatedAt'> | null>(null)
  const [profileEditingId, setProfileEditingId] = useState<string | null>(null)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [profileSaved, setProfileSaved] = useState(false)
  const [profileToDelete, setProfileToDelete] = useState<AssistantProfileDto | null>(null)

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

  useEffect(() => {
    let active = true
    setProfiles([])
    setProfileDraft(null)
    setProfileEditingId(null)
    setProfileError('')
    if (!businessLineId) return () => { active = false }
    api.agents.listAssistantProfiles(businessLineId)
      .then((result) => { if (active) setProfiles(result) })
      .catch(() => { if (active) setProfileError(t('assistantSettings.profilesLoadFailed')) })
    return () => { active = false }
  }, [businessLineId, t])

  const startProfile = (profile?: AssistantProfileDto) => {
    setProfileEditingId(profile?.id ?? null)
    setProfileDraft(profile ? { businessLineId: profile.businessLineId, direction: profile.direction, name: profile.name, enabled: profile.enabled, model: profile.model, transcribeAudio: profile.transcribeAudio, systemPrompt: profile.systemPrompt } : { businessLineId: businessLineId ?? '', direction: 'inbound', name: '', enabled: false, model: settings?.model ?? 'claude-haiku-5-5', transcribeAudio: false, systemPrompt: '' })
    setProfileError('')
    setProfileSaved(false)
  }

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!profileDraft) return
    setProfileSaving(true)
    setProfileError('')
    setProfileSaved(false)
    try {
      const result = profileEditingId
        ? await api.agents.updateAssistantProfile(profileEditingId, profileDraft)
        : await api.agents.createAssistantProfile(profileDraft)
      setProfiles((current) => [...current.filter((profile) => profile.id !== result.id), result].sort((left, right) => left.direction.localeCompare(right.direction) || left.name.localeCompare(right.name)))
      setProfileDraft(null)
      setProfileEditingId(null)
      setProfileSaved(true)
    } catch (requestError) {
      setProfileError(requestError instanceof ApiError && requestError.code === 'ASSISTANT_RUNTIME_NOT_CONFIGURED' ? t('assistantSettings.runtimeMissing') : requestError instanceof ApiError && requestError.code === 'ASSISTANT_TRANSCRIPTION_NOT_CONFIGURED' ? t('assistantSettings.transcriptionMissing') : requestError instanceof ApiError && requestError.status === 409 ? t('assistantSettings.profileNameConflict') : profileDraft.enabled && profileDraft.systemPrompt.trim().length < 100 ? t('assistantSettings.promptRequired') : t('assistantSettings.profileSaveFailed'))
    } finally { setProfileSaving(false) }
  }

  const deleteProfile = async () => {
    const profile = profileToDelete
    if (!profile) return
    setProfileToDelete(null)
    setProfileError('')
    try {
      await api.agents.deleteAssistantProfile(profile.id)
      setProfiles((current) => current.filter((item) => item.id !== profile.id))
      if (profileEditingId === profile.id) { setProfileDraft(null); setProfileEditingId(null) }
    } catch (requestError) {
      setProfileError(requestError instanceof ApiError && requestError.status === 409 ? t('assistantSettings.profileInUse') : t('assistantSettings.profileDeleteFailed'))
    }
  }

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
    {businessLineId && <section className="assistant-profile-panel">
      <header><div><h3>{t('assistantSettings.profilesTitle')}</h3><p>{t('assistantSettings.profilesDescription')}</p></div><Button type="button" className="primary" onClick={() => startProfile()}><Plus size={16} />{t('assistantSettings.newProfile')}</Button></header>
      {profileError && <WorkspaceState kind="error" compact message={profileError} />}
      {profileSaved && <p className="success-message" role="status">{t('assistantSettings.profileSaved')}</p>}
      {profiles.length === 0 && !profileDraft && <p className="assistant-profile-empty">{t('assistantSettings.profilesEmpty')}</p>}
      <div className="assistant-profile-list">{profiles.map((profile) => <article className="assistant-profile-card" key={profile.id}><div><strong>{profile.name}</strong><span>{t(`assistantSettings.${profile.direction}`)} · {profile.enabled ? t('assistantSettings.enabled') : t('assistantSettings.disabled')}</span></div><div className="assistant-profile-actions"><IconButton label={t('assistantSettings.editProfile', { name: profile.name })} onClick={() => startProfile(profile)}><Pencil size={15} /></IconButton><IconButton label={t('assistantSettings.deleteProfile', { name: profile.name })} onClick={() => setProfileToDelete(profile)}><Trash2 size={15} /></IconButton></div></article>)}</div>
      {profileDraft && <form className="assistant-profile-editor" onSubmit={(event) => void saveProfile(event)}>
        <div className="assistant-profile-editor-heading"><h4>{t(profileEditingId ? 'assistantSettings.editProfileTitle' : 'assistantSettings.newProfile')}</h4><Button type="button" onClick={() => { setProfileDraft(null); setProfileEditingId(null) }} aria-label={t('common.cancel')}><X size={16} /></Button></div>
        <label><span>{t('assistantSettings.profileName')}</span><TextField required minLength={2} maxLength={120} value={profileDraft.name} placeholder={t('assistantSettings.profileNamePlaceholder')} onChange={(event) => setProfileDraft({ ...profileDraft, name: event.target.value })} /></label>
        <label><span>{t('assistantSettings.direction')}</span><SelectField value={profileDraft.direction} onChange={(event) => setProfileDraft({ ...profileDraft, direction: event.target.value as 'inbound' | 'outbound' })}><option value="inbound">{t('assistantSettings.inbound')}</option><option value="outbound">{t('assistantSettings.outbound')}</option></SelectField></label>
        <label><span>{t('assistantSettings.model')}</span><SelectField value={profileDraft.model} onChange={(event) => setProfileDraft({ ...profileDraft, model: event.target.value })}>{(settings?.availableModels ?? []).map((option) => <option key={option.id} value={option.id}>{option.name} · {option.provider}</option>)}</SelectField></label>
        <label className="assistant-profile-check"><CheckboxField checked={profileDraft.enabled} onChange={(event) => setProfileDraft({ ...profileDraft, enabled: event.target.checked })} />{t('assistantSettings.enabled')}</label>
        <label className="assistant-profile-check"><CheckboxField checked={profileDraft.transcribeAudio} onChange={(event) => setProfileDraft({ ...profileDraft, transcribeAudio: event.target.checked })} />{t('assistantSettings.transcribeAudio')}</label>
        <label className="assistant-profile-prompt"><span>{t('assistantSettings.prompt')}</span><small>{t('assistantSettings.profilePromptHint')}</small><TextareaField required={profileDraft.enabled} minLength={profileDraft.enabled ? 100 : undefined} maxLength={30000} rows={12} value={profileDraft.systemPrompt} onChange={(event) => setProfileDraft({ ...profileDraft, systemPrompt: event.target.value })} /></label>
        <footer><Button type="submit" className="primary" disabled={profileSaving}>{profileSaving ? t('assistantSettings.saving') : <><Save size={15} />{t('assistantSettings.saveProfile')}</>}</Button></footer>
      </form>}
    </section>}
    {!businessLineId && <p className="assistant-profile-empty">{t('assistantSettings.profilesNeedLine')}</p>}
    <ConfirmDialog open={profileToDelete !== null} onOpenChange={(open) => { if (!open) setProfileToDelete(null) }} title={t('common.confirmAction')} description={profileToDelete ? t('assistantSettings.deleteProfileConfirm', { name: profileToDelete.name }) : ''} confirmLabel={t('assistantSettings.deleteProfile', { name: profileToDelete?.name ?? '' })} cancelLabel={t('common.cancel')} closeLabel={t('common.close')} destructive onConfirm={deleteProfile} />
  </section>
}
