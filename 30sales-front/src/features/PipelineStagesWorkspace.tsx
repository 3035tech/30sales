import { useCallback, useEffect, useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowUp, Archive, Save } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { WorkspaceState } from '../components/ui/WorkspaceState'
import { api, type PipelineStagesDto } from '../lib/api/client'
import './PipelineStagesWorkspace.css'

export function PipelineStagesWorkspace({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation()
  const [data, setData] = useState<PipelineStagesDto | null>(null)
  const [name, setName] = useState('')
  const [afterStageKey, setAfterStageKey] = useState('qualification')
  const [editing, setEditing] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const refresh = useCallback(async () => {
    try { setData(await api.opportunities.pipelineStages.list()); setError('') }
    catch { setError(t('pipelineStageSettings.loadFailed')) }
  }, [t])
  useEffect(() => { void refresh() }, [refresh])
  const active = data?.stages.filter((stage) => stage.isActive) ?? []
  const label = (stage: PipelineStagesDto['stages'][number]) => stage.isSystem ? t(`opportunityStages.${stage.stage}`) : stage.name ?? t('pipelineStageSettings.custom')
  const mutate = async (operation: () => Promise<PipelineStagesDto>) => {
    setBusy(true); setError(''); setSaved(false)
    try { setData(await operation()); setSaved(true) }
    catch (reason) {
      const code = reason instanceof Error && 'code' in reason ? String(reason.code) : ''
      setError(code === 'PIPELINE_STAGE_IN_USE' ? t('pipelineStageSettings.inUse') : code === 'PIPELINE_STAGE_NAME_EXISTS' ? t('pipelineStageSettings.duplicateName') : t('pipelineStageSettings.saveFailed'))
    } finally { setBusy(false) }
  }
  const create = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!name.trim()) return
    setBusy(true); setError(''); setSaved(false)
    try { setData(await api.opportunities.pipelineStages.create({ name: name.trim(), afterStageKey })); setName(''); setSaved(true) }
    catch (reason) { const code = reason instanceof Error && 'code' in reason ? String(reason.code) : ''; setError(code === 'PIPELINE_STAGE_NAME_EXISTS' ? t('pipelineStageSettings.duplicateName') : t('pipelineStageSettings.saveFailed')) }
    finally { setBusy(false) }
  }
  const move = (key: string, offset: -1 | 1) => {
    const index = active.findIndex((stage) => stage.key === key)
    const target = index + offset
    if (index < 0 || target < 0 || target >= active.length) return
    const next = [...active]
    ;[next[index], next[target]] = [next[target], next[index]]
    if (next.at(-2)?.key !== 'won' || next.at(-1)?.key !== 'lost') return
    void mutate(() => api.opportunities.pipelineStages.reorder(next.map((stage) => stage.key)))
  }

  return <section className="pipeline-settings-page">
    <header className="pipeline-settings-heading"><button type="button" onClick={onBack} aria-label={t('pipelineStageSettings.back')}><ArrowLeft size={16} /></button><div><p className="eyebrow">{t('pipelineStageSettings.eyebrow')}</p><h2>{t('pipelineStageSettings.title')}</h2><p>{t('pipelineStageSettings.description')}</p></div></header>
    {error && <WorkspaceState kind="error" compact message={error} />}{saved && <p className="pipeline-settings-success" role="status">{t('pipelineStageSettings.saved')}</p>}
    {!data && !error ? <WorkspaceState kind="loading" message={t('common.loading')} /> : !data ? null : !data.canManage ? <WorkspaceState kind="empty" message={t('pipelineStageSettings.managerOnly')} /> : <>
      <form className="pipeline-stage-create" onSubmit={(event) => void create(event)}><h3>{t('pipelineStageSettings.addTitle')}</h3><label>{t('pipelineStageSettings.name')}<input value={name} minLength={2} maxLength={64} onChange={(event) => setName(event.target.value)} required /></label><label>{t('pipelineStageSettings.insertAfter')}<select value={afterStageKey} onChange={(event) => setAfterStageKey(event.target.value)}>{active.filter((stage) => stage.stage !== 'won' && stage.stage !== 'lost').map((stage) => <option key={stage.key} value={stage.key}>{label(stage)}</option>)}</select></label><button className="primary" disabled={busy}>{t('pipelineStageSettings.add')}<Save size={14} /></button></form>
      <section className="pipeline-stage-list"><h3>{t('pipelineStageSettings.listTitle')}</h3><p>{t('pipelineStageSettings.systemHint')}</p>{active.map((stage, index) => <article key={stage.key} className="pipeline-stage-row"><div className="pipeline-stage-position">{index + 1}</div><div className="pipeline-stage-info"><strong>{label(stage)}</strong><small>{stage.isSystem ? t('pipelineStageSettings.system') : t('pipelineStageSettings.custom')}</small></div>{stage.isSystem ? null : <><label className="pipeline-stage-rename"><span>{t('pipelineStageSettings.rename')}</span><input value={editing[stage.key] ?? stage.name ?? ''} onChange={(event) => setEditing((current) => ({ ...current, [stage.key]: event.target.value }))} maxLength={64} /></label><button type="button" disabled={busy || !editing[stage.key]?.trim() || editing[stage.key]?.trim() === stage.name} aria-label={t('pipelineStageSettings.saveName')} onClick={() => void mutate(async () => { const result = await api.opportunities.pipelineStages.update(stage.key, { name: editing[stage.key].trim() }); setEditing((current) => { const next = { ...current }; delete next[stage.key]; return next }); return result })}><Save size={15} /></button><button type="button" disabled={busy} aria-label={t('pipelineStageSettings.archive')} onClick={() => void mutate(() => api.opportunities.pipelineStages.archive(stage.key))}><Archive size={15} /></button><button type="button" disabled={busy || index === 0} aria-label={t('pipelineStageSettings.moveUp')} onClick={() => move(stage.key, -1)}><ArrowUp size={15} /></button><button type="button" disabled={busy || index === active.length - 1} aria-label={t('pipelineStageSettings.moveDown')} onClick={() => move(stage.key, 1)}><ArrowDown size={15} /></button></>}</article>)}</section>
    </>}
  </section>
}
