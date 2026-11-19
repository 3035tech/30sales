import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Archive, ArrowRight, BriefcaseBusiness, Check, Circle, Pause, Play, Plus, RefreshCw, Save, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button, CheckboxField, TextField } from '../components/ui/FormControls'
import { WorkspaceState } from '../components/ui/WorkspaceState'
import { api, type BusinessLineDto, type TeamMemberDto } from '../lib/api'
import './BusinessLinesWorkspace.css'

function slugFromName(name: string): string {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80)
}

type BusinessLineSetupStep = 'pipelineStages' | 'assistant' | 'channels' | 'leads'

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
  const [error, setError] = useState('')
  const [feedbackTarget, setFeedbackTarget] = useState<'create' | 'details' | 'members'>('create')
  const [saved, setSaved] = useState(false)
  const [editName, setEditName] = useState('')
  const [editSlug, setEditSlug] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [setupStatus, setSetupStatus] = useState<boolean[] | null>(null)
  const [setupLoading, setSetupLoading] = useState(false)

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
        setSetupStatus([
          selectedMemberIds.length > 0,
          pipelineResult.pipelines.some((pipeline) => pipeline.businessLineId === selectedLineId),
          assistant.enabled && assistant.systemPrompt.trim().length > 0,
          channels.some((channel) => channel.isActive),
          leads.pagination.total > 0,
        ])
      })
      .catch(() => { if (active) setSetupStatus(null) })
      .finally(() => { if (active) setSetupLoading(false) })
    return () => { active = false }
  }, [selectedLineId, selectedLine, selectedMemberIds])

  const openSetupStep = (step: BusinessLineSetupStep) => {
    if (!selectedLine) return
    const paths: Record<BusinessLineSetupStep, string> = { pipelineStages: '/settings/pipeline-stages', assistant: '/settings/assistant', channels: '/settings/channels', leads: '/leads' }
    navigate({ pathname: paths[step], search: `?businessLineId=${encodeURIComponent(selectedLine.id)}` })
  }

  const createLine = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true); setError(''); setFeedbackTarget('create'); setSaved(false)
    try {
      const createdLine = await api.businessLines.create({ name: name.trim(), slug: slug.trim(), description: description.trim() || undefined })
      setName(''); setSlug(''); setDescription(''); setSlugEdited(false)
      setLines((current) => [...current, createdLine].sort((left, right) => left.name.localeCompare(right.name)))
      setSelectedLineId(createdLine.id)
      setSaved(true)
    } catch { setError(t('businessLines.createFailed')) }
    finally { setBusy(false) }
  }

  const saveMembers = async () => {
    if (!selectedLine) return
    setBusy(true); setError(''); setFeedbackTarget('members'); setSaved(false)
    try {
      const result = await api.businessLines.setMembers(selectedLine.id, selectedMemberIds)
      setLines((current) => current.map((line) => line.id === selectedLine.id ? { ...line, memberCount: result.data.length } : line))
      setSaved(true)
    } catch { setError(t('businessLines.membersSaveFailed')) }
    finally { setBusy(false) }
  }

  const saveLineDetails = async () => {
    if (!selectedLine) return
    setBusy(true); setError(''); setFeedbackTarget('details'); setSaved(false)
    try {
      const updated = await api.businessLines.update(selectedLine.id, { name: editName.trim(), slug: editSlug.trim(), description: editDescription.trim() })
      setLines((current) => current.map((line) => line.id === updated.id ? updated : line).sort((left, right) => left.name.localeCompare(right.name)))
      setSaved(true)
    } catch { setError(t('businessLines.updateFailed')) }
    finally { setBusy(false) }
  }

  const changeStatus = async (status: 'active' | 'paused' | 'archived') => {
    if (!selectedLine) return
    setBusy(true); setError(''); setFeedbackTarget('details'); setSaved(false)
    try {
      const updated = await api.businessLines.update(selectedLine.id, { status })
      setLines((current) => current.map((line) => line.id === updated.id ? updated : line))
      setSaved(true)
    } catch { setError(t('businessLines.statusUpdateFailed')) }
    finally { setBusy(false) }
  }

  const toggleMember = (userId: string) => setSelectedMemberIds((current) => current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId])

  return <div className="business-lines-page">
    <div className="section-head"><div><p className="eyebrow">{t('businessLines.eyebrow')}</p><h2>{t('businessLines.title')}</h2><p className="muted">{t('businessLines.description')}</p></div><Button className="refresh" type="button" onClick={() => void refresh()} aria-label={t('businessLines.refresh')}><RefreshCw size={16} /></Button></div>
    <div className="business-lines-grid">
      <section className="business-lines-panel">
        <div className="panel-heading"><span className="card-icon"><Plus size={18} /></span><div><h3>{t('businessLines.createTitle')}</h3><p>{t('businessLines.createHint')}</p></div></div>
        <form className="business-line-create-form" onSubmit={(event) => void createLine(event)}>
          <label>{t('businessLines.name')}<TextField value={name} minLength={2} maxLength={100} required onChange={(event) => { setName(event.target.value); if (!slugEdited) setSlug(slugFromName(event.target.value)) }} /></label>
          <label>{t('businessLines.slug')}<TextField value={slug} pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={80} required onChange={(event) => { setSlug(event.target.value); setSlugEdited(true) }} /><small>{t('businessLines.slugHint')}</small></label>
          <label className="business-line-description">{t('businessLines.descriptionField')}<TextField value={description} maxLength={500} onChange={(event) => setDescription(event.target.value)} /></label>
          <Button className="primary" disabled={busy}><BriefcaseBusiness size={16} />{busy ? t('businessLines.creating') : t('businessLines.create')}</Button>
        </form>
        {feedbackTarget === 'create' && error && <WorkspaceState kind="error" compact message={error} />}{feedbackTarget === 'create' && saved && <p className="business-lines-success" role="status">{t('businessLines.saved')}</p>}
      </section>
      <section className="business-lines-panel">
        <div className="panel-heading"><span className="card-icon"><Users size={18} /></span><div><h3>{t('businessLines.linesTitle')}</h3><p>{t('businessLines.lineCount', { count: lines.length })}</p></div></div>
        {loading && lines.length === 0 ? <WorkspaceState kind="loading" compact message={t('common.loading')} /> : loadError && lines.length === 0 ? <WorkspaceState kind="error" message={t('businessLines.loadFailed')} /> : lines.length === 0 ? <WorkspaceState kind="empty" message={t('businessLines.empty')} /> : <div className="business-lines-list">{lines.map((line) => <button key={line.id} type="button" className={`business-line-option${selectedLineId === line.id ? ' is-selected' : ''}`} aria-pressed={selectedLineId === line.id} onClick={() => { setSelectedLineId(line.id); setSaved(false); setError('') }}><span className="business-line-icon"><BriefcaseBusiness size={17} /></span><span className="business-line-copy"><strong>{line.name}<small className={`business-line-status is-${line.status}`}>{t(`businessLines.status.${line.status}`)}</small></strong><small>{line.slug}{line.description ? ` · ${line.description}` : ''}</small></span><span className="business-line-count">{t('businessLines.assignedCount', { count: line.memberCount })}<ArrowRight size={14} /></span></button>)}</div>}
      </section>
    </div>
    {selectedLine && <section className="business-lines-panel business-line-members-panel">
      <div className="business-line-onboarding">
        <div className="panel-heading"><span className="card-icon"><ArrowRight size={18} /></span><div><h3>{t('businessLines.setupTitle')}</h3><p>{t('businessLines.setupHint', { name: selectedLine.name })}</p></div></div>
        {setupLoading ? <WorkspaceState kind="loading" compact message={t('common.loading')} /> : setupStatus ? <ol className="business-line-setup-steps">
          {[{ key: 'team', ready: selectedMemberIds.length > 0 }, ...[
            { key: 'pipeline', step: 'pipelineStages' as const },
            { key: 'assistant', step: 'assistant' as const },
            { key: 'channel', step: 'channels' as const },
            { key: 'leads', step: 'leads' as const },
          ].map((item, index) => ({ ...item, ready: setupStatus[index + 1] }))].map((item) => <li key={item.key} className={item.ready ? 'is-ready' : ''}>
            <span className="business-line-setup-icon">{item.ready ? <Check size={15} /> : <Circle size={13} />}</span><span>{t(`businessLines.setupSteps.${item.key}`)}</span>
            {'step' in item && <Button type="button" onClick={() => openSetupStep(item.step)}>{t('businessLines.configureStep')}<ArrowRight size={14} /></Button>}
          </li>)}
        </ol> : <WorkspaceState kind="error" compact message={t('businessLines.setupStatusUnavailable')} />}
      </div>
      <div className="business-line-details-form">
        <div className="panel-heading"><span className="card-icon"><BriefcaseBusiness size={18} /></span><div><h3>{t('businessLines.detailsTitle')}</h3><p>{t('businessLines.detailsHint')}</p></div></div>
        <div className="business-line-create-form"><label>{t('businessLines.name')}<TextField value={editName} minLength={2} maxLength={100} required onChange={(event) => setEditName(event.target.value)} /></label><label>{t('businessLines.slug')}<TextField value={editSlug} pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={80} required onChange={(event) => setEditSlug(event.target.value)} /></label><label className="business-line-description">{t('businessLines.descriptionField')}<TextField value={editDescription} maxLength={500} onChange={(event) => setEditDescription(event.target.value)} /></label><Button className="primary" type="button" disabled={busy || selectedLine.status === 'archived'} onClick={() => void saveLineDetails()}><Save size={16} />{t('businessLines.saveDetails')}</Button></div>
        <div className="business-line-lifecycle">{selectedLine.status === 'active' ? <Button type="button" disabled={busy || (selectedLine.isDefault && lines.filter((line) => line.status === 'active').length < 2)} onClick={() => void changeStatus('paused')}><Pause size={16} />{t('businessLines.pause')}</Button> : selectedLine.status === 'paused' ? <><Button className="primary" type="button" disabled={busy} onClick={() => void changeStatus('active')}><Play size={16} />{t('businessLines.activate')}</Button><Button className="danger" type="button" disabled={busy || selectedLine.isDefault} onClick={() => void changeStatus('archived')}><Archive size={16} />{t('businessLines.archive')}</Button></> : <span>{t('businessLines.archivedHint')}</span>}</div>
        {feedbackTarget === 'details' && error && <WorkspaceState kind="error" compact message={error} />}{feedbackTarget === 'details' && saved && <p className="business-lines-success" role="status">{t('businessLines.saved')}</p>}
      </div>
      <div className="panel-heading"><span className="card-icon"><Users size={18} /></span><div><h3>{t('businessLines.membersTitle', { name: selectedLine.name })}</h3><p>{t('businessLines.membersHint')}</p></div><Button className="primary business-line-save" type="button" disabled={busy || membersLoading || membersError} onClick={() => void saveMembers()}><Save size={16} />{busy ? t('businessLines.saving') : t('businessLines.saveMembers')}</Button></div>
      {teamLoadError ? <WorkspaceState kind="error" message={t('businessLines.organizationMembersLoadFailed')} /> : membersLoading ? <WorkspaceState kind="loading" compact message={t('businessLines.membersLoading')} /> : membersError ? <WorkspaceState kind="error" message={t('businessLines.membersLoadFailed')} /> : members.length === 0 ? <WorkspaceState kind="empty" message={t('businessLines.noOrganizationMembers')} /> : <div className="business-line-member-grid">{members.map((member) => <label className="business-line-member" key={member.user.id}><CheckboxField checked={selectedMemberIds.includes(member.user.id)} onChange={() => toggleMember(member.user.id)} /><span><strong>{member.user.name}</strong><small>{member.user.email} · {member.role}</small></span></label>)}</div>}
      {feedbackTarget === 'members' && error && <WorkspaceState kind="error" compact message={error} />}{feedbackTarget === 'members' && saved && <p className="business-lines-success" role="status">{t('businessLines.saved')}</p>}
    </section>}
  </div>
}
