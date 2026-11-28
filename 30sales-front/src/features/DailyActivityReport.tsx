import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, SelectField, TextField } from '../components/ui/FormControls'
import { WorkspaceState } from '../components/ui/WorkspaceState'
import { api, type ChannelDto, type DailyActivityReportDto, type TeamMemberDto } from '../lib/api'
import './DailyActivityReport.css'

type Draft = { ownerUserId: string; newGoal: string; continuationGoal: string }

export function DailyActivityReport({ organizationId, businessLineId, date, canManage }: { organizationId: string; businessLineId?: string; date: string; canManage: boolean }) {
  const { t, i18n } = useTranslation()
  const [activity, setActivity] = useState<DailyActivityReportDto | null>(null)
  const [channels, setChannels] = useState<ChannelDto[]>([])
  const [members, setMembers] = useState<TeamMemberDto[]>([])
  const [lineMembers, setLineMembers] = useState<Record<string, Array<{ userId: string; name: string }>>>({})
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [savingId, setSavingId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [settingsError, setSettingsError] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saved, setSaved] = useState(false)
  const filteredChannels = useMemo(() => channels.filter((channel) => !businessLineId || channel.businessLineId === businessLineId), [channels, businessLineId])
  const totals = useMemo(() => activity?.points.reduce((sum, point) => ({
    newContacts: sum.newContacts + point.newContacts,
    continuations: sum.continuations + point.continuations,
  }), { newContacts: 0, continuations: 0 }) ?? { newContacts: 0, continuations: 0 }, [activity])
  const dateLabel = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'long' }).format(new Date(`${date}T12:00:00`))

  const refresh = useCallback(async () => {
    setLoading(true); setError(false); setSettingsError(false)
    const reportRequest = api.reports.dailyActivity('team', date, businessLineId)
    const channelRequest = canManage ? api.channels.list(businessLineId) : null
    const [reportResult, channelResult] = await Promise.allSettled([reportRequest, ...(channelRequest ? [channelRequest] : [])])
    if (reportResult.status === 'fulfilled') setActivity(reportResult.value)
    else setError(true)
    if (canManage && channelResult?.status === 'fulfilled') {
      const channelData = channelResult.value
      setChannels(channelData)
      setDrafts(Object.fromEntries(channelData.map((channel) => [channel.id, { ownerUserId: channel.activityOwnerUserId ?? '', newGoal: channel.dailyNewContactGoal?.toString() ?? '', continuationGoal: channel.dailyContinuationGoal?.toString() ?? '' }])))
      const [team, ...lineResults] = await Promise.allSettled([
        api.team.listMembers(organizationId),
        ...[...new Set(channelData.flatMap((channel) => channel.businessLineId ? [channel.businessLineId] : []))].map(async (id) => [id, await api.businessLines.members(id)] as const),
      ])
      if (team.status === 'fulfilled' && !team.value.error) setMembers(team.value.data ?? [])
      else setSettingsError(true)
      setLineMembers(Object.fromEntries(lineResults.flatMap((result) => result.status === 'fulfilled' && result.value[1].data ? [[result.value[0], result.value[1].data]] : [])))
      setSettingsError((current) => current || lineResults.some((result) => result.status === 'rejected'))
    } else if (canManage) setSettingsError(true)
    setLoading(false)
  }, [businessLineId, canManage, date, organizationId])

  useEffect(() => { void refresh() }, [refresh])

  const saveChannel = async (channel: ChannelDto) => {
    const draft = drafts[channel.id]
    if (!draft) return
    const parseGoal = (value: string) => {
      if (!value.trim()) return null
      const parsed = Number(value)
      return Number.isInteger(parsed) && parsed >= 1 && parsed <= 10000 ? parsed : Number.NaN
    }
    const dailyNewContactGoal = parseGoal(draft.newGoal)
    const dailyContinuationGoal = parseGoal(draft.continuationGoal)
    if (Number.isNaN(dailyNewContactGoal) || Number.isNaN(dailyContinuationGoal)) { setSaveError(t('dailyActivity.goalValidation')); return }
    setSavingId(channel.id); setSaveError(''); setSaved(false)
    try {
      await api.channels.update(channel.id, { activityOwnerUserId: draft.ownerUserId || null, dailyNewContactGoal, dailyContinuationGoal })
      setSaved(true)
      refresh()
    } catch { setSaveError(t('dailyActivity.saveFailed')) }
    finally { setSavingId('') }
  }

  const setDraft = (channelId: string, patch: Partial<Draft>) => setDrafts((current) => ({ ...current, [channelId]: { ...current[channelId], ...patch } }))

  const progress = (value: number, goal: number | null, label: string) => <div className="daily-activity-progress"><div className="daily-activity-value"><strong>{value}</strong><span>{goal === null ? t('dailyActivity.goalMissing') : t('dailyActivity.ofGoal', { goal })}</span></div>{goal !== null && <><div className="daily-activity-track" role="progressbar" aria-label={label} aria-valuenow={Math.min(value, goal)} aria-valuemin={0} aria-valuemax={goal}><i style={{ width: `${Math.min(100, value / goal * 100)}%` }} /></div><small>{t('dailyActivity.goalProgress', { percent: Math.min(100, Math.round(value / goal * 100)), remaining: Math.max(0, goal - value) })}</small></>}</div>

  return <section className="daily-activity-report" aria-labelledby="daily-activity-report-title" aria-busy={loading}>
    <header className="daily-activity-report-heading"><div><h3 id="daily-activity-report-title">{t('dailyActivity.teamTitle')}</h3><p>{t('dailyActivity.teamHint')}</p><time dateTime={date}>{dateLabel}</time></div><Button type="button" onClick={() => void refresh()} aria-busy={loading}>{t('dailyActivity.refresh')}</Button></header>
    {loading && !activity ? <WorkspaceState kind="loading" compact message={t('common.loading')} /> : error && !activity ? <WorkspaceState kind="error" message={t('dailyActivity.loadFailed')}><Button type="button" onClick={() => void refresh()}>{t('platform.retry')}</Button></WorkspaceState> : <>
      {error && <p role="alert" className="daily-activity-save-error">{t('dailyActivity.loadFailed')}</p>}
      {activity?.points.length ? <>
        <div className="daily-activity-totals" role="group" aria-label={t('dailyActivity.teamTotals')}><article><span>{t('dailyActivity.newContacts')}</span><strong>{totals.newContacts}</strong></article><article><span>{t('dailyActivity.continuations')}</span><strong>{totals.continuations}</strong></article></div>
        <div className="daily-activity-table-wrap"><table><thead><tr><th scope="col">{t('dailyActivity.seller')}</th><th scope="col">{t('dailyActivity.number')}</th><th scope="col">{t('dailyActivity.newContacts')}</th><th scope="col">{t('dailyActivity.continuations')}</th></tr></thead><tbody>{activity.points.map((point) => <tr key={point.channelId}><th scope="row">{point.ownerName}</th><td>{point.channelName}<small>{point.phoneNumber}</small></td><td>{progress(point.newContacts, point.dailyNewContactGoal, t('dailyActivity.newContacts'))}</td><td>{progress(point.continuations, point.dailyContinuationGoal, t('dailyActivity.continuations'))}</td></tr>)}</tbody></table></div>
      </> : <WorkspaceState kind="empty" compact message={t('dailyActivity.noTeamData')} detail={t('dailyActivity.noTeamDataHint')} />}
        {canManage && <details className="daily-activity-settings"><summary>{t('dailyActivity.settingsTitle')}<span>{t('dailyActivity.settingsHint')}</span></summary>{settingsError && <p role="alert" className="daily-activity-save-error">{t('dailyActivity.settingsLoadFailed')}</p>}{saveError && <p role="alert" className="daily-activity-save-error">{saveError}</p>}{saved && <p role="status" className="daily-activity-save-success">{t('dailyActivity.saved')}</p>}<div className="daily-activity-channel-settings">{filteredChannels.map((channel) => {
        const draft = drafts[channel.id] ?? { ownerUserId: '', newGoal: '', continuationGoal: '' }
        const people = channel.businessLineId ? lineMembers[channel.businessLineId] ?? [] : members.map((member) => ({ userId: member.user.id, name: member.user.name }))
        return <div className="daily-activity-channel-setting" key={channel.id}><div className="daily-activity-channel-label"><strong>{channel.displayName}</strong><span>{channel.phoneNumber}</span></div><label>{t('dailyActivity.owner')}<SelectField value={draft.ownerUserId} onChange={(event) => { setSaved(false); setDraft(channel.id, { ownerUserId: event.target.value }) }}><option value="">{t('dailyActivity.unassignedOwner')}</option>{people.map((person) => <option key={person.userId} value={person.userId}>{person.name}</option>)}</SelectField></label><label>{t('dailyActivity.newContactsGoal')}<TextField type="text" inputMode="numeric" value={draft.newGoal} aria-label={t('dailyActivity.newContactsGoal')} onChange={(event) => { setSaved(false); setDraft(channel.id, { newGoal: event.target.value }) }} /></label><label>{t('dailyActivity.continuationsGoal')}<TextField type="text" inputMode="numeric" value={draft.continuationGoal} aria-label={t('dailyActivity.continuationsGoal')} onChange={(event) => { setSaved(false); setDraft(channel.id, { continuationGoal: event.target.value }) }} /></label><Button className="primary" type="button" disabled={savingId === channel.id || (!saveError && draft.ownerUserId === (channel.activityOwnerUserId ?? '') && draft.newGoal === (channel.dailyNewContactGoal?.toString() ?? '') && draft.continuationGoal === (channel.dailyContinuationGoal?.toString() ?? ''))} onClick={() => void saveChannel(channel)}>{savingId === channel.id ? t('common.saving') : t('dailyActivity.save')}</Button></div>
      })}{filteredChannels.length === 0 && <WorkspaceState kind="empty" compact message={t('dailyActivity.noChannels')} />}</div></details>}
      <p className="daily-activity-definition">{t('dailyActivity.definition')}</p>
    </>}
  </section>
}
