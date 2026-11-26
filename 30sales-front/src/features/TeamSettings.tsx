import { Button, SelectField, TextField } from '../components/ui/FormControls'
import { useEffect, useState } from 'react'
import { ArrowRight, Mail, RefreshCw, RotateCw, Trash2, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { WorkspaceState } from '../components/ui/WorkspaceState'
import { Modal } from '../components/ui/Modal'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { notifySystemAlert, SYSTEM_ALERT_KIND } from '../components/ui/SystemAlert'
import { api, type TeamInvitationDto, type TeamMemberDto } from '../lib/api'
import { roleNames, type OrganizationRole } from '../lib/permissions'
import { ORGANIZATION_ROLE } from '../lib/authorizationConstants'

export function TeamSettings({ organizationId }: { organizationId: string }) {
  const { t, i18n } = useTranslation()
  const [members, setMembers] = useState<TeamMemberDto[]>([])
  const [invitations, setInvitations] = useState<TeamInvitationDto[]>([])
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<OrganizationRole>(ORGANIZATION_ROLE.sdr)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [invitationLoadError, setInvitationLoadError] = useState(false)
  const [resendingId, setResendingId] = useState('')
  const [inviteError, setInviteError] = useState(false)
  const [invitationToCancel, setInvitationToCancel] = useState<TeamInvitationDto | null>(null)
  const [cancelingId, setCancelingId] = useState('')

  const refresh = async () => {
    setLoading(true)
    setLoadError(false)
    setInvitationLoadError(false)
    const [membersResult, invitationsResult] = await Promise.all([api.team.listMembers(organizationId), api.team.listInvitations(organizationId)])
    setLoading(false)
    if (membersResult.error) setLoadError(true)
    else setMembers(membersResult.data ?? [])
    if (invitationsResult.error) setInvitationLoadError(true)
    else setInvitations(invitationsResult.data ?? [])
  }
  useEffect(() => { void refresh() }, [organizationId])

  const invite = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setInviteError(false)
    const result = await api.team.invite({ email, role, organizationId })
    setBusy(false)
    if (result.error || !result.emailSent) { setInviteError(true); notifySystemAlert(SYSTEM_ALERT_KIND.error, t('team.inviteFailed')); void refresh(); return }
    setEmail('')
    setInviteOpen(false)
    notifySystemAlert(SYSTEM_ALERT_KIND.success, t('team.invited', { email }))
    void refresh()
  }

  const labelRole = (value: string) => {
    const knownRole = roleNames.find((candidate) => candidate === value)
    return knownRole ? t(`roles.${knownRole}`) : value
  }

  const invitationStatus = (invitation: TeamInvitationDto) => {
    if (invitation.status === 'pending' && Date.parse(invitation.expiresAt) <= Date.now()) return 'expired'
    return invitation.status
  }

  const resendInvitation = async (invitation: TeamInvitationDto) => {
    const invitationRole = roleNames.find((candidate) => candidate === invitation.role)
    if (!invitationRole || resendingId) return
    setResendingId(invitation.id)
    const result = await api.team.resendInvitation({ organizationId, id: invitation.id, email: invitation.email, role: invitationRole })
    setResendingId('')
    if (result.error || !result.emailSent) { notifySystemAlert(SYSTEM_ALERT_KIND.error, t('team.invitationResendFailed')); void refresh(); return }
    notifySystemAlert(SYSTEM_ALERT_KIND.success, t('team.invitationResent', { email: invitation.email }))
    void refresh()
  }

  const cancelInvitation = async () => {
    if (!invitationToCancel || cancelingId) return
    const invitation = invitationToCancel
    setCancelingId(invitation.id)
    try {
      const result = await api.team.cancelInvitation({ organizationId, id: invitation.id })
      if (result.error) { notifySystemAlert(SYSTEM_ALERT_KIND.error, t('team.invitationCancelFailed')); void refresh(); return }
      notifySystemAlert(SYSTEM_ALERT_KIND.success, t('team.invitationCanceledFor', { email: invitation.email }))
      setInvitationToCancel(null)
      void refresh()
    } catch {
      notifySystemAlert(SYSTEM_ALERT_KIND.error, t('team.invitationCancelFailed'))
      void refresh()
    } finally {
      setCancelingId('')
    }
  }

  return <div className="team-page">
    <div className="section-head"><div><p className="eyebrow">{t('team.eyebrow')}</p><h2>{t('team.title')}</h2><p className="muted">{t('team.hint')}</p></div><Button className="refresh" onClick={() => void refresh()} aria-label={t('team.refresh')}><RefreshCw size={16} /></Button></div>
    <div className="team-grid">
      <section className="team-panel"><div className="panel-heading"><span className="card-icon"><Users size={18} /></span><div><h3>{t('team.members')}</h3><p>{(loading || loadError) && members.length === 0 ? t('team.memberCountUnavailable') : t('team.memberCount', { count: members.length })}</p></div></div>
        {loadError && members.length > 0 && <WorkspaceState kind="error" compact message={t('team.loadFailed')} detail={t('table.resultsRetained')} />}
        {loading && members.length > 0 && <WorkspaceState kind="stale" compact message={t('table.refreshingResults')} detail={t('table.showingPreviousResults')} />}
        {loading && members.length === 0 ? <WorkspaceState kind="loading" compact message={t('team.loading')} /> : loadError && members.length === 0 ? <WorkspaceState kind="error" message={t('team.loadFailed')} /> : members.length === 0 ? <WorkspaceState kind="empty" message={t('team.empty')} /> : <div className="member-list">{members.map((member) => <div className="member-row" key={member.id}><span className="avatar">{member.user.name.slice(0, 1)}</span><span className="member-person"><strong>{member.user.name}</strong><small>{member.user.email}</small></span><span className="role-badge">{member.role.split(',').map(labelRole).join(', ')}</span></div>)}</div>}
        <div className="team-invitations"><div className="team-invitations-heading"><h4>{t('team.invitations')}</h4>{invitations.length > 0 && <span className="team-invitation-count">{invitations.length}</span>}</div>
        {loading && invitations.length === 0 ? <WorkspaceState kind="loading" compact message={t('team.loadingInvitations')} /> : invitationLoadError ? <WorkspaceState kind="error" compact message={t('team.invitationLoadFailed')} /> : invitations.length === 0 ? <WorkspaceState kind="empty" compact message={t('team.invitationsEmpty')} /> : <><p className="team-delivery-note">{t('team.deliveryNote')}</p><div className="member-list">{invitations.map((invitation) => {
            const status = invitationStatus(invitation)
            const canResend = (status === 'pending' || status === 'expired') && roleNames.some((candidate) => candidate === invitation.role)
            const canCancel = status === 'pending' || status === 'expired'
            return <div className="member-row team-invitation-row" key={invitation.id}>
              <span className="member-person">
                <strong>{invitation.email}</strong>
                <small>{invitation.role ? labelRole(invitation.role) : t('team.role')} · {t('team.invitationCreatedAt', { date: new Intl.DateTimeFormat(i18n.language, { dateStyle: 'short' }).format(new Date(invitation.createdAt)) })} · {t('team.invitationExpiresAt', { date: new Intl.DateTimeFormat(i18n.language, { dateStyle: 'short' }).format(new Date(invitation.expiresAt)) })}</small>
              </span>
              <span className={`role-badge invitation-status ${status}`}>{t(`team.invitation${status.charAt(0).toUpperCase()}${status.slice(1)}`)}</span>
              {canResend && <Button type="button" className="invitation-resend" disabled={Boolean(resendingId || cancelingId)} aria-label={`${t('team.resendInvitation')}: ${invitation.email}`} onClick={() => void resendInvitation(invitation)}>
                {resendingId === invitation.id ? <RefreshCw size={15} className="is-spinning" aria-hidden="true" /> : <RotateCw size={15} aria-hidden="true" />}
                <span>{resendingId === invitation.id ? t('team.resendingInvitation') : t('team.resendInvitation')}</span>
              </Button>}
              {canCancel && <Button type="button" className="invitation-cancel" disabled={Boolean(resendingId || cancelingId)} aria-label={`${t('team.cancelInvitation')}: ${invitation.email}`} onClick={() => setInvitationToCancel(invitation)}><Trash2 size={15} aria-hidden="true" /><span>{t('team.cancelInvitation')}</span></Button>}
            </div>
          })}</div></>}
        </div>
      </section>
      <section className="team-panel invite-panel"><div className="panel-heading"><span className="card-icon"><Mail size={18} /></span><div><h3>{t('team.inviteTitle')}</h3><p>{t('team.inviteHint')}</p></div></div><Button className="primary" type="button" onClick={() => setInviteOpen(true)}><Mail size={16} />{t('team.sendInvite')}</Button></section>
    </div>
    <Modal open={inviteOpen} onOpenChange={(open) => { setInviteOpen(open); if (open) setInviteError(false) }} title={t('team.inviteTitle')} description={t('team.inviteHint')} closeLabel={t('common.close')} className="team-invite-modal"><form className="invite-form" onSubmit={invite}>{inviteError && <p className="team-invite-error" role="alert">{t('team.inviteFailedDetail')}</p>}<label>{t('common.email')}<TextField type="email" normalize="email" value={email} onChange={(event) => { setEmail(event.target.value); setInviteError(false) }} placeholder={t('team.emailPlaceholder')} required /></label><label>{t('team.role')}<SelectField value={role} onChange={(event) => { const selectedRole = roleNames.find((candidate) => candidate === event.target.value); if (selectedRole) setRole(selectedRole) }}>{roleNames.filter((candidate) => candidate !== ORGANIZATION_ROLE.owner).map((candidate) => <option key={candidate} value={candidate}>{t(`roles.${candidate}`)}</option>)}</SelectField></label><Button className="primary" disabled={busy}>{busy ? t('team.sending') : t('team.sendInvite')}<ArrowRight size={16} /></Button></form></Modal>
    <ConfirmDialog open={Boolean(invitationToCancel)} onOpenChange={(open) => { if (!open && !cancelingId) setInvitationToCancel(null) }} title={t('team.cancelInvitation')} description={t('team.cancelInvitationConfirm', { email: invitationToCancel?.email ?? '' })} confirmLabel={cancelingId ? t('team.cancelingInvitation') : t('team.confirmCancelInvitation')} cancelLabel={t('common.cancel')} closeLabel={t('common.close')} destructive onConfirm={cancelInvitation} />
    <p className="footer-note"><span className="dot" />{t('team.verifyNote')}</p>
  </div>
}
