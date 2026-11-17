import { Button, SelectField, TextField } from '../components/ui/FormControls'
import { useCallback, useEffect, useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowUp, Archive, Save, Star } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { WorkspaceState } from '../components/ui/WorkspaceState'
import { api, type PipelineStagesDto, type PipelinesDto } from '../lib/api'
import './PipelineStagesWorkspace.css'

type SettingsTab = 'pipelines' | 'stages'

export function PipelineStagesWorkspace({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation()
  const [pipelines, setPipelines] = useState<PipelinesDto | null>(null)
  const [pipelineId, setPipelineId] = useState('')
  const [data, setData] = useState<PipelineStagesDto | null>(null)
  const [newPipelineName, setNewPipelineName] = useState('')
  const [pipelineName, setPipelineName] = useState('')
  const [name, setName] = useState('')
  const [afterStageKey, setAfterStageKey] = useState('')
  const [editing, setEditing] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('pipelines')
  const refresh = useCallback(async (requestedPipelineId?: string) => {
    try {
      const pipelineData = await api.opportunities.pipelines.list()
      const activeId = requestedPipelineId && pipelineData.pipelines.some((item) => item.id === requestedPipelineId) ? requestedPipelineId : pipelineId && pipelineData.pipelines.some((item) => item.id === pipelineId) ? pipelineId : pipelineData.defaultPipelineId
      const stages = await api.opportunities.pipelineStages.list(activeId)
      setPipelines(pipelineData); setPipelineId(activeId); setData(stages); setPipelineName(pipelineData.pipelines.find((item) => item.id === activeId)?.name ?? '')
      setAfterStageKey(stages.stages.find((stage) => stage.stage === 'won')?.key ?? '')
      setError('')
    } catch { setError(t('pipelineStageSettings.loadFailed')) }
  }, [pipelineId, t])
  useEffect(() => { void refresh() }, [])
  const active = data?.stages.filter((stage) => stage.isActive) ?? []
  const label = (stage: PipelineStagesDto['stages'][number]) => stage.isSystem ? t(`opportunityStages.${stage.stage}`) : stage.name ?? t('pipelineStageSettings.custom')
  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const nextTab: SettingsTab = event.key === 'Home' ? 'pipelines' : event.key === 'End' ? 'stages' : settingsTab === 'pipelines' ? 'stages' : 'pipelines'
    setSettingsTab(nextTab)
    document.getElementById(`pipeline-settings-tab-${nextTab}`)?.focus()
  }
  const mutate = async (operation: () => Promise<PipelineStagesDto>) => {
    setBusy(true); setError(''); setSaved(false)
    try { setData(await operation()); setSaved(true) }
    catch (reason) {
      const code = reason instanceof Error && 'code' in reason ? String(reason.code) : ''
      setError(code === 'PIPELINE_STAGE_IN_USE' ? t('pipelineStageSettings.inUse') : code === 'PIPELINE_STAGE_NAME_EXISTS' ? t('pipelineStageSettings.duplicateName') : t('pipelineStageSettings.saveFailed'))
    } finally { setBusy(false) }
  }
  const manage = async (operation: () => Promise<PipelinesDto>, nextPipelineId?: string) => {
    setBusy(true); setError(''); setSaved(false)
    try { const result = await operation(); setPipelines(result); await refresh(nextPipelineId ?? pipelineId); setSaved(true) }
    catch (reason) {
      const code = reason instanceof Error && 'code' in reason ? String(reason.code) : ''
      setError(code === 'PIPELINE_IN_USE' ? t('pipelineStageSettings.pipelineInUse') : code === 'DEFAULT_PIPELINE_LOCKED' ? t('pipelineStageSettings.defaultLocked') : code === 'PIPELINE_NAME_EXISTS' ? t('pipelineStageSettings.pipelineDuplicate') : t('pipelineStageSettings.saveFailed'))
    } finally { setBusy(false) }
  }
  const createPipeline = async (event: React.FormEvent) => {
    event.preventDefault(); if (!newPipelineName.trim()) return
    setBusy(true); setError('')
    try {
      const result = await api.opportunities.pipelines.create(newPipelineName.trim())
      const created = result.pipelines.find((item) => item.name === newPipelineName.trim())
      setNewPipelineName(''); setPipelines(result); await refresh(created?.id); setSettingsTab('stages'); setSaved(true)
    } catch (reason) {
      const code = reason instanceof Error && 'code' in reason ? String(reason.code) : ''
      setError(code === 'PIPELINE_NAME_EXISTS' ? t('pipelineStageSettings.pipelineDuplicate') : t('pipelineStageSettings.saveFailed'))
    } finally { setBusy(false) }
  }
  const create = async (event: React.FormEvent) => {
    event.preventDefault(); if (!name.trim() || !pipelineId || !afterStageKey) return
    setBusy(true); setError(''); setSaved(false)
    try { setData(await api.opportunities.pipelineStages.create({ pipelineId, name: name.trim(), afterStageKey })); setName(''); setSaved(true) }
    catch (reason) { const code = reason instanceof Error && 'code' in reason ? String(reason.code) : ''; setError(code === 'PIPELINE_STAGE_NAME_EXISTS' ? t('pipelineStageSettings.duplicateName') : t('pipelineStageSettings.saveFailed')) }
    finally { setBusy(false) }
  }
  const move = (key: string, offset: -1 | 1) => {
    const index = active.findIndex((stage) => stage.key === key); const target = index + offset
    if (index < 0 || target < 0 || target >= active.length) return
    const next = [...active]; [next[index], next[target]] = [next[target], next[index]]
    if (next.at(-2)?.stage !== 'won' || next.at(-1)?.stage !== 'lost') return
    void mutate(() => api.opportunities.pipelineStages.reorder(pipelineId, next.map((stage) => stage.key)))
  }

  return <section className="pipeline-settings-page">
    <header className="pipeline-settings-heading"><Button type="button" onClick={onBack} aria-label={t('pipelineStageSettings.back')}><ArrowLeft size={16} /></Button><div><p className="eyebrow">{t('pipelineStageSettings.eyebrow')}</p><h2>{t('pipelineStageSettings.title')}</h2><p>{t('pipelineStageSettings.description')}</p></div></header>
    {error && <WorkspaceState kind="error" compact message={error} />}{saved && <p className="pipeline-settings-success" role="status">{t('pipelineStageSettings.saved')}</p>}
    {!pipelines && !error ? <WorkspaceState kind="loading" message={t('common.loading')} /> : !pipelines ? null : !pipelines.canManage ? <WorkspaceState kind="empty" message={t('pipelineStageSettings.managerOnly')} /> : <>
      <div className="pipeline-settings-tabs" role="tablist" aria-label={t('pipelineStageSettings.tabs')}>
        <Button type="button" role="tab" id="pipeline-settings-tab-pipelines" tabIndex={settingsTab === 'pipelines' ? 0 : -1} aria-controls="pipeline-settings-panel-pipelines" aria-selected={settingsTab === 'pipelines'} className={settingsTab === 'pipelines' ? 'selected' : ''} onKeyDown={handleTabKeyDown} onClick={() => setSettingsTab('pipelines')}>{t('pipelineStageSettings.pipelinesTab')}</Button>
        <Button type="button" role="tab" id="pipeline-settings-tab-stages" tabIndex={settingsTab === 'stages' ? 0 : -1} aria-controls="pipeline-settings-panel-stages" aria-selected={settingsTab === 'stages'} className={settingsTab === 'stages' ? 'selected' : ''} onKeyDown={handleTabKeyDown} onClick={() => setSettingsTab('stages')}>{t('pipelineStageSettings.stagesTab')}</Button>
      </div>
      <section className="pipeline-settings-selection">
        <label>{t('pipelineStageSettings.choosePipeline')}<SelectField value={pipelineId} onChange={(event) => { setPipelineId(event.target.value); void refresh(event.target.value) }}>{pipelines.pipelines.map((item) => <option key={item.id} value={item.id}>{item.name}{item.isDefault ? ` · ${t('pipelineStageSettings.default')}` : ''}</option>)}</SelectField></label>
      </section>
      {settingsTab === 'pipelines' && <section className="pipeline-stage-create pipeline-management" role="tabpanel" id="pipeline-settings-panel-pipelines" aria-labelledby="pipeline-settings-tab-pipelines">
        <h3>{t('pipelineStageSettings.pipelinesTitle')}</h3>
        <div className="pipeline-management-controls"><label>{t('pipelineStageSettings.pipelineName')}<TextField value={pipelineName} maxLength={80} onChange={(event) => setPipelineName(event.target.value)} /></label><Button type="button" disabled={busy || pipelineName.trim().length < 2 || pipelineName.trim() === pipelines.pipelines.find((item) => item.id === pipelineId)?.name} onClick={() => void manage(() => api.opportunities.pipelines.rename(pipelineId, pipelineName.trim()))}><Save size={14} />{t('pipelineStageSettings.renamePipeline')}</Button><Button type="button" disabled={busy || pipelines.pipelines.find((item) => item.id === pipelineId)?.isDefault} onClick={() => void manage(() => api.opportunities.pipelines.setDefault(pipelineId))}><Star size={14} />{t('pipelineStageSettings.makeDefault')}</Button><Button type="button" className="danger" disabled={busy || pipelines.pipelines.find((item) => item.id === pipelineId)?.isDefault} onClick={() => void manage(() => api.opportunities.pipelines.archive(pipelineId))}><Archive size={14} />{t('pipelineStageSettings.archivePipeline')}</Button></div>
        <form className="pipeline-management-create" onSubmit={(event) => void createPipeline(event)}><label>{t('pipelineStageSettings.newPipeline')}<TextField value={newPipelineName} maxLength={80} minLength={2} onChange={(event) => setNewPipelineName(event.target.value)} required /></label><Button className="primary" disabled={busy}>{t('pipelineStageSettings.createPipeline')}<Save size={14} /></Button><p>{t('pipelineStageSettings.terminalsHint')}</p></form>
      </section>}
      {data && settingsTab === 'stages' && <div role="tabpanel" id="pipeline-settings-panel-stages" aria-labelledby="pipeline-settings-tab-stages">
        <form className="pipeline-stage-create" onSubmit={(event) => void create(event)}><h3>{t('pipelineStageSettings.addTitle')}</h3><label>{t('pipelineStageSettings.name')}<TextField value={name} minLength={2} maxLength={64} onChange={(event) => setName(event.target.value)} required /></label><label>{t('pipelineStageSettings.insertAfter')}<SelectField value={afterStageKey} onChange={(event) => setAfterStageKey(event.target.value)}>{active.filter((stage) => stage.stage !== 'lost').map((stage) => <option key={stage.key} value={stage.key}>{label(stage)}</option>)}</SelectField></label><Button className="primary" disabled={busy || !afterStageKey}>{t('pipelineStageSettings.add')}<Save size={14} /></Button></form>
        <section className="pipeline-stage-list"><h3>{t('pipelineStageSettings.listTitle')}</h3><p>{t('pipelineStageSettings.systemHint')}</p>{active.map((stage, index) => <article key={stage.key} className="pipeline-stage-row"><div className="pipeline-stage-position">{index + 1}</div><div className="pipeline-stage-info"><strong>{label(stage)}</strong><small>{stage.isSystem ? t('pipelineStageSettings.system') : t('pipelineStageSettings.custom')}</small></div>{stage.isSystem ? stage.stage === 'won' || stage.stage === 'lost' ? null : <><Button type="button" disabled={busy || index === 0} aria-label={t('pipelineStageSettings.moveUp')} onClick={() => move(stage.key, -1)}><ArrowUp size={15} /></Button><Button type="button" disabled={busy || index >= active.length - 3} aria-label={t('pipelineStageSettings.moveDown')} onClick={() => move(stage.key, 1)}><ArrowDown size={15} /></Button></> : <><label className="pipeline-stage-rename"><span>{t('pipelineStageSettings.rename')}</span><TextField value={editing[stage.key] ?? stage.name ?? ''} onChange={(event) => setEditing((current) => ({ ...current, [stage.key]: event.target.value }))} maxLength={64} /></label><Button type="button" disabled={busy || !editing[stage.key]?.trim() || editing[stage.key]?.trim() === stage.name} aria-label={t('pipelineStageSettings.saveName')} onClick={() => void mutate(async () => { const result = await api.opportunities.pipelineStages.update(stage.key, { pipelineId, name: editing[stage.key].trim() }); setEditing((current) => { const next = { ...current }; delete next[stage.key]; return next }); return result })}><Save size={15} /></Button><Button type="button" disabled={busy} aria-label={t('pipelineStageSettings.archive')} onClick={() => void mutate(() => api.opportunities.pipelineStages.archive(pipelineId, stage.key))}><Archive size={15} /></Button><Button type="button" disabled={busy || index === 0} aria-label={t('pipelineStageSettings.moveUp')} onClick={() => move(stage.key, -1)}><ArrowUp size={15} /></Button><Button type="button" disabled={busy || index >= active.length - 3} aria-label={t('pipelineStageSettings.moveDown')} onClick={() => move(stage.key, 1)}><ArrowDown size={15} /></Button></>}</article>)}</section>
      </div>}
    </>}
  </section>
}
