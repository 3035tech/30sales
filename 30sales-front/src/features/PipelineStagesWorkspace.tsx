import { Button, SelectField, TextField } from '../components/ui/FormControls'
import { useCallback, useEffect, useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowUp, Archive, Save, Star } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { WorkspaceState } from '../components/ui/WorkspaceState'
import { Modal } from '../components/ui/Modal'
import { notifySystemAlert, SYSTEM_ALERT_KIND } from '../components/ui/SystemAlert'
import { api, type BusinessLineDto, type PipelineStagesDto, type PipelinesDto } from '../lib/api'
import './PipelineStagesWorkspace.css'

type SettingsTab = 'pipelines' | 'stages'

export function PipelineStagesWorkspace({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation()
  const [pipelines, setPipelines] = useState<PipelinesDto | null>(null)
  const [businessLines, setBusinessLines] = useState<BusinessLineDto[]>([])
  const [pipelineId, setPipelineId] = useState('')
  const [newPipelineBusinessLineId, setNewPipelineBusinessLineId] = useState('')
  const [data, setData] = useState<PipelineStagesDto | null>(null)
  const [newPipelineName, setNewPipelineName] = useState('')
  const [pipelineName, setPipelineName] = useState('')
  const [name, setName] = useState('')
  const [afterStageKey, setAfterStageKey] = useState('')
  const [editing, setEditing] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('pipelines')
  const [pipelineCreateOpen, setPipelineCreateOpen] = useState(false)
  const [stageCreateOpen, setStageCreateOpen] = useState(false)
  const refresh = useCallback(async (requestedPipelineId?: string) => {
    try {
      const [pipelineData, businessLineData] = await Promise.all([api.opportunities.pipelines.list(), api.businessLines.list()])
      const activeId = requestedPipelineId && pipelineData.pipelines.some((item) => item.id === requestedPipelineId) ? requestedPipelineId : pipelineId && pipelineData.pipelines.some((item) => item.id === pipelineId) ? pipelineId : pipelineData.defaultPipelineId
      const stages = await api.opportunities.pipelineStages.list(activeId)
      const activePipeline = pipelineData.pipelines.find((item) => item.id === activeId)
      const defaultBusinessLineId = pipelineData.pipelines.find((item) => item.id === pipelineData.defaultPipelineId)?.businessLineId
      setPipelines(pipelineData); setBusinessLines(businessLineData.data); setPipelineId(activeId); setData(stages); setPipelineName(activePipeline?.name ?? '')
      setNewPipelineBusinessLineId(activePipeline?.businessLineId ?? defaultBusinessLineId ?? businessLineData.data[0]?.id ?? '')
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
    setBusy(true); setError('')
    try { setData(await operation()); notifySystemAlert(SYSTEM_ALERT_KIND.success, t('pipelineStageSettings.saved')) }
    catch (reason) {
      const code = reason instanceof Error && 'code' in reason ? String(reason.code) : ''
      notifySystemAlert(SYSTEM_ALERT_KIND.error, code === 'PIPELINE_STAGE_IN_USE' ? t('pipelineStageSettings.inUse') : code === 'PIPELINE_STAGE_NAME_EXISTS' ? t('pipelineStageSettings.duplicateName') : t('pipelineStageSettings.saveFailed'))
    } finally { setBusy(false) }
  }
  const manage = async (operation: () => Promise<PipelinesDto>, nextPipelineId?: string) => {
    setBusy(true); setError('')
    try { const result = await operation(); setPipelines(result); await refresh(nextPipelineId ?? pipelineId); notifySystemAlert(SYSTEM_ALERT_KIND.success, t('pipelineStageSettings.saved')) }
    catch (reason) {
      const code = reason instanceof Error && 'code' in reason ? String(reason.code) : ''
      notifySystemAlert(SYSTEM_ALERT_KIND.error, code === 'PIPELINE_IN_USE' ? t('pipelineStageSettings.pipelineInUse') : code === 'DEFAULT_PIPELINE_LOCKED' ? t('pipelineStageSettings.defaultLocked') : code === 'PIPELINE_NAME_EXISTS' ? t('pipelineStageSettings.pipelineDuplicate') : t('pipelineStageSettings.saveFailed'))
    } finally { setBusy(false) }
  }
  const createPipeline = async (event: React.FormEvent) => {
    event.preventDefault(); if (!newPipelineName.trim()) return
    setBusy(true); setError('')
    try {
      const result = await api.opportunities.pipelines.create(newPipelineName.trim(), newPipelineBusinessLineId)
      const created = result.pipelines.find((item) => item.name === newPipelineName.trim() && item.businessLineId === newPipelineBusinessLineId)
      setNewPipelineName(''); setPipelines(result); await refresh(created?.id); setSettingsTab('stages'); setPipelineCreateOpen(false); notifySystemAlert(SYSTEM_ALERT_KIND.success, t('pipelineStageSettings.saved'))
    } catch (reason) {
      const code = reason instanceof Error && 'code' in reason ? String(reason.code) : ''
      notifySystemAlert(SYSTEM_ALERT_KIND.error, code === 'PIPELINE_NAME_EXISTS' ? t('pipelineStageSettings.pipelineDuplicate') : t('pipelineStageSettings.saveFailed'))
    } finally { setBusy(false) }
  }
  const create = async (event: React.FormEvent) => {
    event.preventDefault(); if (!name.trim() || !pipelineId || !afterStageKey) return
    setBusy(true); setError('')
    try { setData(await api.opportunities.pipelineStages.create({ pipelineId, name: name.trim(), afterStageKey })); setName(''); setStageCreateOpen(false); notifySystemAlert(SYSTEM_ALERT_KIND.success, t('pipelineStageSettings.saved')) }
    catch (reason) { const code = reason instanceof Error && 'code' in reason ? String(reason.code) : ''; notifySystemAlert(SYSTEM_ALERT_KIND.error, code === 'PIPELINE_STAGE_NAME_EXISTS' ? t('pipelineStageSettings.duplicateName') : t('pipelineStageSettings.saveFailed')) }
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
    {error && <WorkspaceState kind="error" compact message={error} />}
    {!pipelines && !error ? <WorkspaceState kind="loading" message={t('common.loading')} /> : !pipelines ? null : !pipelines.canManage ? <WorkspaceState kind="empty" message={t('pipelineStageSettings.managerOnly')} /> : <>
      <div className="pipeline-settings-tabs" role="tablist" aria-label={t('pipelineStageSettings.tabs')}>
        <Button type="button" role="tab" id="pipeline-settings-tab-pipelines" tabIndex={settingsTab === 'pipelines' ? 0 : -1} aria-controls="pipeline-settings-panel-pipelines" aria-selected={settingsTab === 'pipelines'} className={settingsTab === 'pipelines' ? 'selected' : ''} onKeyDown={handleTabKeyDown} onClick={() => setSettingsTab('pipelines')}>{t('pipelineStageSettings.pipelinesTab')}</Button>
        <Button type="button" role="tab" id="pipeline-settings-tab-stages" tabIndex={settingsTab === 'stages' ? 0 : -1} aria-controls="pipeline-settings-panel-stages" aria-selected={settingsTab === 'stages'} className={settingsTab === 'stages' ? 'selected' : ''} onKeyDown={handleTabKeyDown} onClick={() => setSettingsTab('stages')}>{t('pipelineStageSettings.stagesTab')}</Button>
      </div>
      <section className="pipeline-settings-selection">
        <label>{t('pipelineStageSettings.choosePipeline')}<SelectField value={pipelineId} onChange={(event) => { setPipelineId(event.target.value); void refresh(event.target.value) }}>{pipelines.pipelines.map((item) => <option key={item.id} value={item.id}>{item.name}{item.businessLineName ? ` · ${item.businessLineName}` : ''}{item.isDefault ? ` · ${t('pipelineStageSettings.default')}` : ''}</option>)}</SelectField></label>
      </section>
      {settingsTab === 'pipelines' && <section className="pipeline-stage-create pipeline-management" role="tabpanel" id="pipeline-settings-panel-pipelines" aria-labelledby="pipeline-settings-tab-pipelines">
        <div className="pipeline-management-heading"><h3>{t('pipelineStageSettings.pipelinesTitle')}</h3><Button type="button" className="primary" onClick={() => { setNewPipelineName(''); setPipelineCreateOpen(true) }}><Save size={14} />{t('pipelineStageSettings.newPipeline')}</Button></div>
        <div className="pipeline-management-controls"><label>{t('pipelineStageSettings.pipelineName')}<TextField value={pipelineName} maxLength={80} onChange={(event) => setPipelineName(event.target.value)} /></label><Button type="button" disabled={busy || pipelineName.trim().length < 2 || pipelineName.trim() === pipelines.pipelines.find((item) => item.id === pipelineId)?.name} onClick={() => void manage(() => api.opportunities.pipelines.rename(pipelineId, pipelineName.trim()))}><Save size={14} />{t('pipelineStageSettings.renamePipeline')}</Button><Button type="button" disabled={busy || pipelines.pipelines.find((item) => item.id === pipelineId)?.isDefault} onClick={() => void manage(() => api.opportunities.pipelines.setDefault(pipelineId))}><Star size={14} />{t('pipelineStageSettings.makeDefault')}</Button><Button type="button" className="danger" disabled={busy || pipelines.pipelines.find((item) => item.id === pipelineId)?.isDefault} onClick={() => void manage(() => api.opportunities.pipelines.archive(pipelineId))}><Archive size={14} />{t('pipelineStageSettings.archivePipeline')}</Button></div>
      </section>}
      {data && settingsTab === 'stages' && <div role="tabpanel" id="pipeline-settings-panel-stages" aria-labelledby="pipeline-settings-tab-stages">
        <div className="pipeline-stage-toolbar"><h3>{t('pipelineStageSettings.listTitle')}</h3><Button type="button" className="primary" onClick={() => { setName(''); setStageCreateOpen(true) }}><Save size={14} />{t('pipelineStageSettings.add')}</Button></div>
        <section className="pipeline-stage-list"><p>{t('pipelineStageSettings.systemHint')}</p>{active.map((stage, index) => <article key={stage.key} className="pipeline-stage-row"><div className="pipeline-stage-position">{index + 1}</div><div className="pipeline-stage-info"><strong>{label(stage)}</strong><small>{stage.isSystem ? t('pipelineStageSettings.system') : t('pipelineStageSettings.custom')}</small></div>{stage.isSystem ? stage.stage === 'won' || stage.stage === 'lost' ? null : <><Button type="button" disabled={busy || index === 0} aria-label={t('pipelineStageSettings.moveUp')} onClick={() => move(stage.key, -1)}><ArrowUp size={15} /></Button><Button type="button" disabled={busy || index >= active.length - 3} aria-label={t('pipelineStageSettings.moveDown')} onClick={() => move(stage.key, 1)}><ArrowDown size={15} /></Button></> : <><label className="pipeline-stage-rename"><span>{t('pipelineStageSettings.rename')}</span><TextField value={editing[stage.key] ?? stage.name ?? ''} onChange={(event) => setEditing((current) => ({ ...current, [stage.key]: event.target.value }))} maxLength={64} /></label><Button type="button" disabled={busy || !editing[stage.key]?.trim() || editing[stage.key]?.trim() === stage.name} aria-label={t('pipelineStageSettings.saveName')} onClick={() => void mutate(async () => { const result = await api.opportunities.pipelineStages.update(stage.key, { pipelineId, name: editing[stage.key].trim() }); setEditing((current) => { const next = { ...current }; delete next[stage.key]; return next }); return result })}><Save size={15} /></Button><Button type="button" disabled={busy} aria-label={t('pipelineStageSettings.archive')} onClick={() => void mutate(() => api.opportunities.pipelineStages.archive(pipelineId, stage.key))}><Archive size={15} /></Button><Button type="button" disabled={busy || index === 0} aria-label={t('pipelineStageSettings.moveUp')} onClick={() => move(stage.key, -1)}><ArrowUp size={15} /></Button><Button type="button" disabled={busy || index >= active.length - 3} aria-label={t('pipelineStageSettings.moveDown')} onClick={() => move(stage.key, 1)}><ArrowDown size={15} /></Button></>}</article>)}</section>
      </div>}
    </>}
    <Modal open={pipelineCreateOpen} onOpenChange={setPipelineCreateOpen} title={t('pipelineStageSettings.newPipeline')} description={t('pipelineStageSettings.terminalsHint')} closeLabel={t('common.close')}><form className="pipeline-management-create" onSubmit={(event) => void createPipeline(event)}><label>{t('pipelineStageSettings.newPipeline')}<TextField value={newPipelineName} maxLength={80} minLength={2} onChange={(event) => setNewPipelineName(event.target.value)} required /></label><label>{t('businessLines.title')}<SelectField value={newPipelineBusinessLineId} onChange={(event) => setNewPipelineBusinessLineId(event.target.value)} required>{businessLines.map((line) => <option key={line.id} value={line.id}>{line.name}</option>)}</SelectField></label><Button className="primary" disabled={busy || !newPipelineBusinessLineId}>{t('pipelineStageSettings.createPipeline')}<Save size={14} /></Button></form></Modal>
    <Modal open={stageCreateOpen} onOpenChange={setStageCreateOpen} title={t('pipelineStageSettings.addTitle')} closeLabel={t('common.close')}><form className="pipeline-stage-create" onSubmit={(event) => void create(event)}><label>{t('pipelineStageSettings.name')}<TextField value={name} minLength={2} maxLength={64} onChange={(event) => setName(event.target.value)} required /></label><label>{t('pipelineStageSettings.insertAfter')}<SelectField value={afterStageKey} onChange={(event) => setAfterStageKey(event.target.value)}>{active.filter((stage) => stage.stage !== 'lost').map((stage) => <option key={stage.key} value={stage.key}>{label(stage)}</option>)}</SelectField></label><Button className="primary" disabled={busy || !afterStageKey}>{t('pipelineStageSettings.add')}<Save size={14} /></Button></form></Modal>
  </section>
}
