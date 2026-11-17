import { Button, CheckboxField, NumericField } from '../components/ui/FormControls'
import { useEffect, useState } from 'react'
import { Save } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { WorkspaceState } from '../components/ui/WorkspaceState'
import { api, type CloserEventSlaSettingsDto } from '../lib/api'
import './CloserSlaSettingsWorkspace.css'

export function CloserSlaSettingsWorkspace() {
  const { t } = useTranslation()
  const [settings, setSettings] = useState<CloserEventSlaSettingsDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let active = true
    api.closerEvents.slaSettings().then((result) => { if (active) setSettings(result) })
      .catch(() => { if (active) setError(t('closerSlaSettings.loadFailed')) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [t])

  const updateTarget = (eventType: CloserEventSlaSettingsDto['policies'][number]['eventType'], targetMinutes: number | null) => {
    setSaved(false)
    setSettings((current) => current ? { ...current, policies: current.policies.map((policy) => policy.eventType === eventType ? { ...policy, targetMinutes, escalateToManagers: targetMinutes === null ? false : policy.escalateToManagers } : policy) } : current)
  }

  const updateEscalation = (eventType: CloserEventSlaSettingsDto['policies'][number]['eventType'], escalateToManagers: boolean) => {
    setSaved(false)
    setSettings((current) => current ? { ...current, policies: current.policies.map((policy) => policy.eventType === eventType ? { ...policy, escalateToManagers } : policy) } : current)
  }

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!settings) return
    setSaving(true); setError(''); setSaved(false)
    try {
      const result = await api.closerEvents.saveSlaSettings({ policies: settings.policies })
      setSettings(result); setSaved(true)
    } catch { setError(t('closerSlaSettings.saveFailed')) }
    finally { setSaving(false) }
  }

  return <section className="closer-sla-page">
    <header><p className="eyebrow">{t('closerSlaSettings.eyebrow')}</p><h2>{t('closerSlaSettings.title')}</h2><p className="muted">{t('closerSlaSettings.description')}</p></header>
    {loading ? <WorkspaceState kind="loading" message={t('common.loading')} /> : settings ? <form className="closer-sla-panel" onSubmit={(event) => void save(event)}>
      {settings.policies.map((policy) => <div className="closer-sla-row" key={policy.eventType}>
        <span>{t(`closerSlaSettings.eventTypes.${policy.eventType}`)}</span>
        <span className="closer-sla-control"><NumericField aria-label={t(`closerSlaSettings.eventTypes.${policy.eventType}`)} mode="integer" min={1} max={10080} step={1} disabled={!settings.canManage || saving} value={policy.targetMinutes} placeholder={t('closerSlaSettings.disabled')} onValueChange={(value) => updateTarget(policy.eventType, value)} /><span>{t('closerSlaSettings.minutes')}</span><label className="closer-sla-escalation"><CheckboxField checked={policy.escalateToManagers} disabled={!settings.canManage || saving || policy.targetMinutes === null} onChange={(event) => updateEscalation(policy.eventType, event.target.checked)} />{t('closerSlaSettings.escalateToManagers')}</label></span>
      </div>)}
      {!settings.canManage && <p className="notice">{t('closerSlaSettings.managerOnly')}</p>}
      {settings.canManage && <div className="closer-sla-footer"><Button className="primary" type="submit" disabled={saving}>{saving ? t('closerSlaSettings.saving') : <><Save size={15} />{t('closerSlaSettings.save')}</>}</Button></div>}
      {error && <WorkspaceState kind="error" compact message={error} />}{saved && <p className="success-message" role="status">{t('closerSlaSettings.saved')}</p>}
    </form> : <WorkspaceState kind="error" message={error || t('closerSlaSettings.loadFailed')} />}
  </section>
}
