import { useEffect, useMemo, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Archive, ArrowRight, BriefcaseBusiness, Check, Pause, Play, Plus, RefreshCw, Save, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button, CheckboxField, SelectField, TextField, TextareaField } from '../components/ui/FormControls'
import { Modal } from '../components/ui/Modal'
import { WorkspaceState } from '../components/ui/WorkspaceState'
import { notifySystemAlert, SYSTEM_ALERT_KIND } from '../components/ui/SystemAlert'
import { api, type BusinessLineDto, type TeamMemberDto } from '../lib/api'
import './BusinessLinesWorkspace.css'

function slugFromName(name: string): string {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80)
}

type BusinessLineSetupStep = 'team' | 'pipelineStages' | 'assistant' | 'channels' | 'leads'
type BusinessLineSetupStatus = { team: boolean; pipeline: boolean; assistant: boolean; channel: boolean; leads: boolean; leadsApplicable: boolean }
type BusinessLineTab = 'overview' | 'team' | 'details'

export function BusinessLinesWorkspace({ organizationId }: { organizationId: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [lines, setLines] = useState<BusinessLineDto[]>([])
  const [members, setMembers] = useState<TeamMemberDto[]>([])
  const [selectedLineId, setSelectedLineId] = useState('')
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([])
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [loading, setLoading] = useState(true)
  const [membersLoading, setMembersLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [teamLoadError, setTeamLoadError] = useState(false)
  const [membersError, setMembersError] = useState(false)
  const [editName, setEditName] = useState('')
  const [editSlug, setEditSlug] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [setupStatus, setSetupStatus] = useState<BusinessLineSetupStatus | null>(null)
  const [setupLoading, setSetupLoading] = useState(false)
  const [setupRetry, setSetupRetry] = useState(0)
  const [activeTab, setActiveTab] = useState<BusinessLineTab>('overview')
  const [createOpen, setCreateOpen] = useState(false)

  const selectedLine = useMemo(() => lines.find((line) => line.id === selectedLineId) ?? null, [lines, selectedLineId])

  const refresh = async () => {
    setLoading(true)
    setLoadError(false)
    const [linesResult, membersResult] = await Promise.allSettled([api.businessLines.list(), api.team.listMembers(organizationId)])
    setLoading(false)
    if (linesResult.status === 'rejected') setLoadError(true)
    else {
      const nextLines = linesResult.value.data
      setLines(nextLines)
      if (!nextLines.some((line) => line.id === selectedLineId)) setSelectedLineId(nextLines[0]?.id ?? '')
    }
    if (membersResult.status === 'rejected' || membersResult.value.error) setTeamLoadError(true)
    else { setTeamLoadError(false); setMembers(membersResult.value.data ?? []) }
  }

  useEffect(() => { void refresh() }, [organizationId])

  useEffect(() => {
    if (!selectedLineId) { setSelectedMemberIds([]); return }
    const line = lines.find((item) => item.id === selectedLineId)
    if (line) { setEditName(line.name); setEditSlug(line.slug); setEditDescription(line.description ?? '') }
    let active = true
    setMembersLoading(true)
    setMembersError(false)
    api.businessLines.members(selectedLineId).then((result) => {
      if (!active) return
      setMembersError(false)
      setSelectedMemberIds(result.data.map((member) => member.userId))
    }).catch(() => { if (active) setMembersError(true) }).finally(() => { if (active) setMembersLoading(false) })
    return () => { active = false }
  }, [selectedLineId, lines])

  useEffect(() => {
    if (!selectedLineId || !selectedLine) { setSetupStatus(null); return }
    let active = true
    setSetupLoading(true)
    void Promise.all([api.opportunities.pipelines.list(), api.agents.getAssistantSettings(selectedLineId), api.channels.list(selectedLineId), api.leads.listPage({ businessLineId: selectedLineId, limit: 1, offset: 0 })])
      .then(([pipelineResult, assistant, channels, leads]) => {
        if (!active) return
        const leadsApplicable = channels.some((channel) => channel.operationMode !== 'inbound')
        setSetupStatus({
          team: selectedMemberIds.length > 0,
          pipeline: pipelineResult.pipelines.some((pipeline) => pipeline.businessLineId === selectedLineId),
          assistant: assistant.enabled && assistant.systemPrompt.trim().length > 0,
          channel: channels.some((channel) => channel.isActive && channel.isConfigured),
          leads: leads.pagination.total > 0,
          leadsApplicable,
        })
      })
      .catch(() => { if (active) setSetupStatus(null) })
      .finally(() => { if (active) setSetupLoading(false) })
    return () => { active = false }
  }, [selectedLineId, selectedLine, selectedMemberIds, setupRetry])

  const openSetupStep = (step: BusinessLineSetupStep) => {
    if (!selectedLine) return
    if (step === 'team') {
      setActiveTab('team')
      window.setTimeout(() => document.getElementById('business-line-team-heading')?.focus({ preventScroll: true }), 0)
      return
    }
    const paths: Record<Exclude<BusinessLineSetupStep, 'team'>, string> = { pipelineStages: '/settings/pipeline-stages', assistant: '/settings/assistant', channels: '/settings/channels', leads: '/leads' }
    navigate({ pathname: paths[step], search: `?businessLineId=${encodeURIComponent(selectedLine.id)}` })
  }

  const createLine = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    try {
      const createdLine = await api.businessLines.create({ name: name.trim(), slug: slug.trim(), description: description.trim() || undefined })
      setName(''); setSlug(''); setDescription(''); setSlugEdited(false)
      setLines((current) => [...current, createdLine].sort((left, right) => left.name.localeCompare(right.name)))
      setSelectedLineId(createdLine.id)
      setActiveTab('overview')
      setCreateOpen(false)
      notifySystemAlert(SYSTEM_ALERT_KIND.success, t('businessLines.saved'))
    } catch { notifySystemAlert(SYSTEM_ALERT_KIND.error, t('businessLines.createFailed')) }
    finally { setBusy(false) }
  }

  const saveMembers = async () => {
    if (!selectedLine) return
    setBusy(true)
    try {
      const result = await api.businessLines.setMembers(selectedLine.id, selectedMemberIds)
      setLines((current) => current.map((line) => line.id === selectedLine.id ? { ...line, memberCount: result.data.length } : line))
      notifySystemAlert(SYSTEM_ALERT_KIND.success, t('businessLines.saved'))
    } catch { notifySystemAlert(SYSTEM_ALERT_KIND.error, t('businessLines.membersSaveFailed')) }
    finally { setBusy(false) }
  }

  const saveLineDetails = async () => {
    if (!selectedLine) return
    setBusy(true)
    try {
      const updated = await api.businessLines.update(selectedLine.id, { name: editName.trim(), slug: editSlug.trim(), description: editDescription.trim() })
      setLines((current) => current.map((line) => line.id === updated.id ? updated : line).sort((left, right) => left.name.localeCompare(right.name)))
      notifySystemAlert(SYSTEM_ALERT_KIND.success, t('businessLines.saved'))
    } catch { notifySystemAlert(SYSTEM_ALERT_KIND.error, t('businessLines.updateFailed')) }
    finally { setBusy(false) }
  }

  const changeStatus = async (status: 'active' | 'paused' | 'archived') => {
    if (!selectedLine) return
    setBusy(true)
    try {
      const updated = await api.businessLines.update(selectedLine.id, { status })
      setLines((current) => current.map((line) => line.id === updated.id ? updated : line))
      notifySystemAlert(SYSTEM_ALERT_KIND.success, t('businessLines.saved'))
    } catch { notifySystemAlert(SYSTEM_ALERT_KIND.error, t('businessLines.statusUpdateFailed')) }
    finally { setBusy(false) }
  }

  const toggleMember = (userId: string) => setSelectedMemberIds((current) => current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId])
  const setupSteps = setupStatus ? [
    { key: 'team', step: 'team' as const, ready: setupStatus.team, optional: false },
    { key: 'pipeline', step: 'pipelineStages' as const, ready: setupStatus.pipeline, optional: false },
    { key: 'assistant', step: 'assistant' as const, ready: setupStatus.assistant, optional: false },
    { key: 'channel', step: 'channels' as const, ready: setupStatus.channel, optional: false },
    { key: 'leads', step: 'leads' as const, ready: setupStatus.leads, optional: !setupStatus.leadsApplicable && !setupStatus.leads },
  ] : []
  const nextStepIndex = setupSteps.findIndex((item) => !item.ready && !item.optional)
  const tabLabels: Record<BusinessLineTab, string> = { overview: t('businessLines.overviewTab'), team: t('businessLines.teamTab'), details: t('businessLines.detailsTab') }
  const handleTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const tabs: BusinessLineTab[] = ['overview', 'team', 'details']
    const index = tabs.indexOf(activeTab)
    const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index - 1 + tabs.length) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1
    if (next < 0) return
    event.preventDefault()
    setActiveTab(tabs[next])
    window.setTimeout(() => document.getElementById(`business-line-tab-${tabs[next]}`)?.focus(), 0)
  }

  return <div className="business-lines-page">
    <div className="section-head"><div><p className="eyebrow">{t('businessLines.eyebrow')}</p><h2>{t('businessLines.title')}</h2><p className="muted">{t('businessLines.description')}</p></div><div className="business-line-page-actions"><Button className="primary" type="button" onClick={() => setCreateOpen(true)}><Plus size={16} />{t('businessLines.createLineAction')}</Button><Button className="refresh" type="button" onClick={() => void refresh()} aria-label={t('businessLines.refresh')}><RefreshCw size={16} /></Button></div></div>
    {loading && lines.length === 0 ? <WorkspaceState kind="loading" compact message={t('common.loading')} /> : loadError && lines.length === 0 ? <WorkspaceState kind="error" message={t('businessLines.loadFailed')}><Button type="button" onClick={() => void refresh()}>{t('platform.retry')}</Button></WorkspaceState> : lines.length === 0 ? <section className="business-lines-panel business-lines-empty"><span className="card-icon"><BriefcaseBusiness size={20} /></span><h3>{t('businessLines.createFirstTitle')}</h3><p>{t('businessLines.modelDescription')}</p><Button className="primary" type="button" onClick={() => setCreateOpen(true)}><Plus size={16} />{t('businessLines.createFirstLine')}</Button></section> : <>
      <section className="business-line-context business-lines-panel" aria-label={t('businessLines.currentLine')}><span className="business-line-context-icon"><BriefcaseBusiness size={18} /></span><label htmlFor="business-line-selector">{t('businessLines.currentLine')}</label><SelectField id="business-line-selector" value={selectedLineId} onChange={(event) => { setSelectedLineId(String(event.target.value)); setActiveTab('overview') }}>{lines.map((line) => <option key={line.id} value={line.id}>{line.name} · {t(`businessLines.status.${line.status}`)}</option>)}</SelectField><span className="business-line-context-count">{t('businessLines.lineCount', { count: lines.length })}</span></section>
      {selectedLine && <>
        <div className="business-line-tabs" role="tablist" aria-label={t('businessLines.lineSettingsTabs')} onKeyDown={handleTabKeyDown}>{(['overview', 'team', 'details'] as const).map((tab) => <Button key={tab} id={`business-line-tab-${tab}`} type="button" role="tab" aria-selected={activeTab === tab} aria-controls="business-line-panel" tabIndex={activeTab === tab ? 0 : -1} className={`business-line-tab${activeTab === tab ? ' is-active' : ''}`} onClick={() => setActiveTab(tab)}>{tab === 'overview' ? <ArrowRight size={16} /> : tab === 'team' ? <Users size={16} /> : <BriefcaseBusiness size={16} />}{tabLabels[tab]}</Button>)}</div>
        <section className="business-lines-panel business-line-tab-panel" id="business-line-panel" role="tabpanel" aria-labelledby={`business-line-tab-${activeTab}`}>
          {activeTab === 'overview' && <div className="business-line-onboarding"><div className="panel-heading"><span className="card-icon"><ArrowRight size={18} /></span><div><h3>{t('businessLines.setupTitle')}</h3><p>{t('businessLines.setupHint', { name: selectedLine.name })}</p></div></div>{setupLoading ? <WorkspaceState kind="loading" compact message={t('common.loading')} /> : setupStatus ? <ol className="business-line-setup-steps">{setupSteps.map((item, index) => <li key={item.key} className={`${item.ready ? 'is-ready' : ''}${item.optional ? ' is-optional' : ''}${index === nextStepIndex ? ' is-next' : ''}`} aria-current={index === nextStepIndex ? 'step' : undefined}><span className="business-line-setup-icon">{item.ready ? <Check size={15} /> : <span aria-hidden="true">{index + 1}</span>}</span><span>{t(`businessLines.setupSteps.${item.key}`)}{item.optional && <small className="business-line-optional-label">{t('businessLines.optionalStep')}</small>}</span><Button type="button" onClick={() => openSetupStep(item.step)}>{item.ready ? t('businessLines.reviewStep') : item.optional ? t('businessLines.addOptionalStep') : t('businessLines.configureStep')}<ArrowRight size={14} /></Button></li>)}</ol> : <WorkspaceState kind="error" compact message={t('businessLines.setupStatusUnavailable')}><Button type="button" onClick={() => setSetupRetry((current) => current + 1)}>{t('platform.retry')}</Button></WorkspaceState>}<p className="business-line-setup-note">{t('businessLines.setupNote')}</p></div>}
          {activeTab === 'details' && <div className="business-line-details-form"><div className="panel-heading"><span className="card-icon"><BriefcaseBusiness size={18} /></span><div><h3>{t('businessLines.detailsTitle')}</h3><p>{t('businessLines.detailsHint')}</p></div></div><div className="business-line-create-form"><label>{t('businessLines.name')}<TextField value={editName} minLength={2} maxLength={100} required onChange={(event) => setEditName(event.target.value)} /></label><label>{t('businessLines.slug')}<TextField value={editSlug} pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={80} required onChange={(event) => setEditSlug(event.target.value)} /></label><label className="business-line-description">{t('businessLines.descriptionField')}<TextareaField value={editDescription} maxLength={500} onChange={(event) => setEditDescription(event.target.value)} /></label><Button className="primary" type="button" disabled={busy || selectedLine.status === 'archived'} onClick={() => void saveLineDetails()}><Save size={16} />{t('businessLines.saveDetails')}</Button></div><div className="business-line-lifecycle">{selectedLine.status === 'active' ? <Button type="button" disabled={busy || (selectedLine.isDefault && lines.filter((line) => line.status === 'active').length < 2)} onClick={() => void changeStatus('paused')}><Pause size={16} />{t('businessLines.pause')}</Button> : selectedLine.status === 'paused' ? <><Button className="primary" type="button" disabled={busy} onClick={() => void changeStatus('active')}><Play size={16} />{t('businessLines.activate')}</Button><Button className="danger" type="button" disabled={busy || selectedLine.isDefault} onClick={() => void changeStatus('archived')}><Archive size={16} />{t('businessLines.archive')}</Button></> : <span>{t('businessLines.archivedHint')}</span>}</div></div>}
          {activeTab === 'team' && <><div className="panel-heading"><span className="card-icon"><Users size={18} /></span><div><h3 id="business-line-team-heading" tabIndex={-1}>{t('businessLines.membersTitle', { name: selectedLine.name })}</h3><p>{t('businessLines.membersHint')}</p></div><Button className="primary business-line-save" type="button" disabled={busy || membersLoading || membersError} onClick={() => void saveMembers()}><Save size={16} />{busy ? t('businessLines.saving') : t('businessLines.saveMembers')}</Button></div>{teamLoadError ? <WorkspaceState kind="error" message={t('businessLines.organizationMembersLoadFailed')}><Button type="button" onClick={() => void refresh()}>{t('platform.retry')}</Button></WorkspaceState> : membersLoading ? <WorkspaceState kind="loading" compact message={t('businessLines.membersLoading')} /> : membersError ? <WorkspaceState kind="error" message={t('businessLines.membersLoadFailed')}><Button type="button" onClick={() => void refresh()}>{t('platform.retry')}</Button></WorkspaceState> : members.length === 0 ? <WorkspaceState kind="empty" message={t('businessLines.noOrganizationMembers')} /> : <div className="business-line-member-grid">{members.map((member) => <label className="business-line-member" key={member.user.id}><CheckboxField checked={selectedMemberIds.includes(member.user.id)} onChange={() => toggleMember(member.user.id)} /><span><strong>{member.user.name}</strong><small>{member.user.email} · {member.role}</small></span></label>)}</div>}</>}
        </section>
      </>}
    </>}
    <Modal open={createOpen} onOpenChange={setCreateOpen} title={t(lines.length ? 'businessLines.createTitle' : 'businessLines.createFirstTitle')} description={t('businessLines.createHint')} closeLabel={t('common.close')} className="business-line-create-modal"><form className="business-line-create-form" onSubmit={(event) => void createLine(event)}><label>{t('businessLines.name')}<TextField id="business-line-name" value={name} minLength={2} maxLength={100} required onChange={(event) => { setName(event.target.value); if (!slugEdited) setSlug(slugFromName(event.target.value)) }} /></label><label>{t('businessLines.slug')}<TextField value={slug} pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={80} required onChange={(event) => { setSlug(event.target.value); setSlugEdited(true) }} /><small>{t('businessLines.slugHint')}</small></label><label className="business-line-description">{t('businessLines.descriptionField')}<TextareaField value={description} maxLength={500} onChange={(event) => setDescription(event.target.value)} /></label><Button className="primary" disabled={busy}><BriefcaseBusiness size={16} />{busy ? t('businessLines.creating') : t('businessLines.create')}</Button></form></Modal>
  </div>
}
