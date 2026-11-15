import { useEffect, useState } from 'react'
import { ArrowRight, Mail, RefreshCw, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { WorkspaceState } from '../components/ui/WorkspaceState'
import { api, type TeamMemberDto } from '../lib/api/client'
import { roleNames, type OrganizationRole } from '../lib/permissions'

export function TeamSettings({ organizationId }: { organizationId: string }) {
  const { t } = useTranslation()
  const [members, setMembers] = useState<TeamMemberDto[]>([])
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<OrganizationRole>('sdr')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loadError, setLoadError] = useState(false)

  const refresh = async () => {
    setLoading(true)
    setLoadError(false)
    const result = await api.team.listMembers(organizationId)
    setLoading(false)
    if (result.error) { setError(t('team.loadFailed')); setLoadError(true); return }
    setMembers(result.data ?? [])
    setError('')
  }
  useEffect(() => { void refresh() }, [organizationId])

  const invite = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    const result = await api.team.invite({ email, role, organizationId })
    setBusy(false)
    if (result.error) { setError(t('team.inviteFailed')); return }
    setEmail('')
    setMessage(t('team.invited', { email }))
    void refresh()
  }

  const labelRole = (value: string) => {
    const knownRole = roleNames.find((candidate) => candidate === value)
    return knownRole ? t(`roles.${knownRole}`) : value
  }

  return <div className="team-page">
    <div className="section-head"><div><p className="eyebrow">{t('team.eyebrow')}</p><h2>{t('team.title')}</h2><p className="muted">{t('team.hint')}</p></div><button className="refresh" onClick={() => void refresh()} aria-label={t('team.refresh')}><RefreshCw size={16} /></button></div>
    <div className="team-grid">
      <section className="team-panel"><div className="panel-heading"><span className="card-icon"><Users size={18} /></span><div><h3>{t('team.members')}</h3><p>{(loading || loadError) && members.length === 0 ? t('team.memberCountUnavailable') : t('team.memberCount', { count: members.length })}</p></div></div>
        {loadError && members.length > 0 && <WorkspaceState kind="error" compact message={t('team.loadFailed')} detail={t('table.resultsRetained')} />}
        {loading && members.length > 0 && <WorkspaceState kind="stale" compact message={t('table.refreshingResults')} detail={t('table.showingPreviousResults')} />}
        {loading && members.length === 0 ? <WorkspaceState kind="loading" compact message={t('team.loading')} /> : loadError && members.length === 0 ? <WorkspaceState kind="error" message={t('team.loadFailed')} /> : members.length === 0 ? <WorkspaceState kind="empty" message={t('team.empty')} /> : <div className="member-list">{members.map((member) => <div className="member-row" key={member.id}><span className="avatar">{member.user.name.slice(0, 1)}</span><span className="member-person"><strong>{member.user.name}</strong><small>{member.user.email}</small></span><span className="role-badge">{member.role.split(',').map(labelRole).join(', ')}</span></div>)}</div>}
      </section>
      <section className="team-panel invite-panel"><div className="panel-heading"><span className="card-icon"><Mail size={18} /></span><div><h3>{t('team.inviteTitle')}</h3><p>{t('team.inviteHint')}</p></div></div>
        <form className="invite-form" onSubmit={invite}><label>{t('common.email')}<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder={t('team.emailPlaceholder')} required /></label>
          <label>{t('team.role')}<select value={role} onChange={(event) => { const selectedRole = roleNames.find((candidate) => candidate === event.target.value); if (selectedRole) setRole(selectedRole) }}>{roleNames.filter((candidate) => candidate !== 'owner').map((candidate) => <option key={candidate} value={candidate}>{t(`roles.${candidate}`)}</option>)}</select></label>
          <button className="primary" disabled={busy}>{busy ? t('team.sending') : t('team.sendInvite')}<ArrowRight size={16} /></button>
        </form>
        {message && <p className="success-message">{message}</p>}{error && !loadError && <WorkspaceState kind="error" compact message={error} />}
      </section>
    </div>
    <p className="footer-note"><span className="dot" />{t('team.verifyNote')}</p>
  </div>
}
