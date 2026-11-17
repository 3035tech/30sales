import { Button, CheckboxField, SelectField, TextField } from './components/ui/FormControls'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, BarChart3, Bell, Building2, ChevronDown, ListTodo, MessageSquareText, TrendingUp, UserRoundCheck, Users, ShieldCheck, Database, CalendarClock, Briefcase, Radio, Bot, Menu, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { WorkspaceState } from './components/ui/WorkspaceState'
import { Breadcrumbs } from './components/ui/Breadcrumbs'
import { api, USER_NOTIFICATION_TYPE, type SessionDto, type UserNotificationDto } from './lib/api'
import { setPlatformOrganizationContext } from './lib/api/client'
import i18n from './lib/i18n'
import { getOrganizationRoles, ORGANIZATION_PROFILE_UPDATE_ROLES, ORGANIZATION_ROLE, ORGANIZATION_SEGMENT_MANAGEMENT_ROLES, PLATFORM_ROLE } from './lib/authorizationConstants'
import { TeamSettings } from './features/TeamSettings'
import { LeadsWorkspace } from './features/LeadsWorkspace'
import { TasksWorkspace } from './features/TasksWorkspace'
import { HandoffsWorkspace } from './features/HandoffsWorkspace'
import { PipelineWorkspace } from './features/PipelineWorkspace'
import { InboxWorkspace } from './features/InboxWorkspace'
import { AuditWorkspace } from './features/AuditWorkspace'
import { ImportsWorkspace } from './features/ImportsWorkspace'
import { TodayWorkspace } from './features/TodayWorkspace'
import { FunnelReportWorkspace } from './features/FunnelReportWorkspace'
import { AccountsWorkspace } from './features/AccountsWorkspace'
import { CloserQueueWorkspace } from './features/CloserQueueWorkspace'
import { ChannelsWorkspace } from './features/ChannelsWorkspace'
import { AssistantSettingsWorkspace } from './features/AssistantSettingsWorkspace'
import { CloserSlaSettingsWorkspace } from './features/CloserSlaSettingsWorkspace'
import { PipelineStagesWorkspace } from './features/PipelineStagesWorkspace'
import { PlatformWorkspace } from './features/PlatformWorkspace'
import './App.css'
import './polish.css'

type Page = 'home' | 'closerQueue' | 'closerSla' | 'pipelineStages' | 'inbox' | 'leads' | 'accounts' | 'channels' | 'assistant' | 'tasks' | 'handoffs' | 'pipeline' | 'reports' | 'audit' | 'imports' | 'team'
const pagePaths: Record<Page, string> = {
  home: '/today', closerQueue: '/closer', closerSla: '/settings/closer-sla', pipelineStages: '/settings/pipeline', inbox: '/inbox', leads: '/leads',
  accounts: '/accounts', channels: '/settings/channels', assistant: '/settings/assistant', tasks: '/tasks',
  handoffs: '/handoffs', pipeline: '/pipeline', reports: '/reports/funnel', audit: '/settings/audit',
  imports: '/settings/imports', team: '/settings/team',
}
const rolePages: Record<string, readonly Page[]> = {
  [ORGANIZATION_ROLE.owner]: ['home', 'closerQueue', 'closerSla', 'pipelineStages', 'inbox', 'leads', 'accounts', 'channels', 'assistant', 'tasks', 'handoffs', 'pipeline', 'reports', 'audit', 'imports', 'team'],
  [ORGANIZATION_ROLE.admin]: ['home', 'closerQueue', 'closerSla', 'pipelineStages', 'inbox', 'leads', 'accounts', 'channels', 'assistant', 'tasks', 'handoffs', 'pipeline', 'reports', 'audit', 'imports', 'team'],
  [ORGANIZATION_ROLE.manager]: ['home', 'closerQueue', 'closerSla', 'pipelineStages', 'inbox', 'leads', 'accounts', 'channels', 'assistant', 'tasks', 'handoffs', 'pipeline', 'reports', 'audit', 'imports', 'team'],
  [ORGANIZATION_ROLE.closer]: ['closerQueue', 'tasks', 'inbox', 'handoffs', 'pipeline'],
  [ORGANIZATION_ROLE.bdr]: ['home', 'tasks', 'leads', 'accounts'],
  [ORGANIZATION_ROLE.sdr]: ['home', 'tasks', 'inbox', 'leads', 'handoffs'],
  [ORGANIZATION_ROLE.operations]: ['home', 'channels', 'assistant', 'closerSla', 'audit', 'imports'],
  [ORGANIZATION_ROLE.analyst]: ['home', 'reports'],
}
const roleDefaultPages: Record<string, Page> = {
  [ORGANIZATION_ROLE.owner]: 'home', [ORGANIZATION_ROLE.admin]: 'home', [ORGANIZATION_ROLE.manager]: 'home',
  [ORGANIZATION_ROLE.closer]: 'closerQueue', [ORGANIZATION_ROLE.bdr]: 'leads', [ORGANIZATION_ROLE.sdr]: 'inbox',
  [ORGANIZATION_ROLE.operations]: 'channels', [ORGANIZATION_ROLE.analyst]: 'reports',
}
const pagesByPath = Object.fromEntries(Object.entries(pagePaths).map(([page, path]) => [path, page])) as Record<string, Page>
const pageTranslationKeys: Record<Page, string> = {
  home: 'today', closerQueue: 'closerQueue', closerSla: 'closerSlaSettings', pipelineStages: 'pipelineStageSettings', inbox: 'inbox', leads: 'leads',
  accounts: 'accounts', channels: 'channels', assistant: 'assistantSettings', tasks: 'tasks', handoffs: 'handoffs',
  pipeline: 'pipeline', reports: 'funnelReport', audit: 'audit', imports: 'imports', team: 'team',
}
const breadcrumbGroupKeys: Partial<Record<Page, string>> = {
  home: 'common.navGroups.daily', tasks: 'common.navGroups.daily', inbox: 'common.navGroups.customers', leads: 'common.navGroups.customers', accounts: 'common.navGroups.customers',
  closerQueue: 'common.navGroups.sales', handoffs: 'common.navGroups.sales', pipeline: 'common.navGroups.sales', pipelineStages: 'common.navGroups.sales',
  channels: 'common.navGroups.management', assistant: 'common.navGroups.management', closerSla: 'common.navGroups.management', reports: 'common.navGroups.management', audit: 'common.navGroups.management', imports: 'common.navGroups.management', team: 'common.navGroups.management',
}

export default function App() {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const [current, setCurrent] = useState<SessionDto | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const page = pagesByPath[location.pathname] ?? 'home'
  const activeRole = current?.activeOrganizationRole ?? ''
  const activeRoles = getOrganizationRoles(activeRole)
  const canManageSegments = activeRoles.some((role) => ORGANIZATION_SEGMENT_MANAGEMENT_ROLES.some((managementRole) => managementRole === role))
  const canUpdateAccountProfile = activeRoles.some((role) => ORGANIZATION_PROFILE_UPDATE_ROLES.some((updateRole) => updateRole === role))
  const activeDefaultPage = activeRoles.map((role) => roleDefaultPages[role]).find((defaultPage) => defaultPage !== undefined) ?? 'home'
  const allowedPages = [...new Set(activeRoles.flatMap((role) => rolePages[role] ?? []))]
  const canViewPage = (target: Page) => Boolean(current?.platformOrganizationContext || allowedPages.includes(target))
  const breadcrumbItems = page === 'home'
    ? []
    : [
      { label: t('common.breadcrumbRoot'), href: pagePaths[activeDefaultPage] },
      { label: t(breadcrumbGroupKeys[page] ?? 'common.navGroups.daily') },
      ...(page === 'pipelineStages' ? [{ label: t('common.pipelineNav'), href: pagePaths.pipeline }] : []),
    ]
  const searchParams = new URLSearchParams(location.search)
  const leadSearchSeed = page === 'leads' ? searchParams.get('search') ?? '' : ''
  const inboxSearchSeed = page === 'inbox' ? searchParams.get('search') ?? '' : ''
  const inboxConversationSeed = page === 'inbox' ? searchParams.get('conversationId') ?? '' : ''
  const [notifications, setNotifications] = useState<UserNotificationDto[]>([])
  const [notificationToast, setNotificationToast] = useState<UserNotificationDto | null>(null)
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notificationsError, setNotificationsError] = useState(false)
  const [notificationsActionError, setNotificationsActionError] = useState(false)
  const [notificationsLoading, setNotificationsLoading] = useState(false)
  const [markingNotificationsRead, setMarkingNotificationsRead] = useState(false)
  const notificationsLoadedRef = useRef(false)
  const notificationIdsRef = useRef<Set<string>>(new Set())
  const notificationRefreshRevision = useRef(0)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [changingOrganization, setChangingOrganization] = useState(false)
  const [organizationSwitchError, setOrganizationSwitchError] = useState(false)

  const navigateToPage = (targetPage: Page, query: Record<string, string | undefined> = {}, options: { replace?: boolean } = {}) => {
    const params = new URLSearchParams()
    Object.entries(query).forEach(([key, value]) => { if (value) params.set(key, value) })
    const queryString = params.toString()
    navigate({ pathname: pagePaths[targetPage], search: queryString ? `?${queryString}` : '' }, options)
    setMobileMenuOpen(false)
  }

  useEffect(() => {
    api.session.get().then((session) => {
      if (!session.platformOrganizationContext) setPlatformOrganizationContext(null)
      setCurrent(session)
    }).catch(() => setError('authRequired')).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!current) return
    if (location.pathname === '/platform' && current.user.platformRole === PLATFORM_ROLE.superAdmin) return
    if (!pagesByPath[location.pathname] || !canViewPage(page)) navigate(pagePaths[activeDefaultPage], { replace: true })
  }, [activeDefaultPage, current, location.pathname, navigate, page])

  useEffect(() => {
    if (!mobileMenuOpen) return
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMobileMenuOpen(false) }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [mobileMenuOpen])

  useEffect(() => {
    if (!current?.activeOrganizationId) return
    let active = true
    const refresh = () => {
      if (document.visibilityState !== 'visible') return
      const revision = ++notificationRefreshRevision.current
      if (!notificationsLoadedRef.current) setNotificationsLoading(true)
      api.notifications.list().then((page) => {
        if (active && revision === notificationRefreshRevision.current) {
          if (notificationsLoadedRef.current) {
            const newest = page.data.find((notification) => !notificationIdsRef.current.has(notification.id))
            if (newest) setNotificationToast(newest)
          }
          notificationIdsRef.current = new Set(page.data.map((notification) => notification.id))
          setNotifications(page.data); setUnreadNotificationCount(page.unreadCount); setNotificationsError(false); notificationsLoadedRef.current = true
        }
      }).catch(() => { if (active && revision === notificationRefreshRevision.current) setNotificationsError(true) }).finally(() => { if (active && revision === notificationRefreshRevision.current) setNotificationsLoading(false) })
    }
    refresh()
    const interval = window.setInterval(refresh, 30_000)
    document.addEventListener('visibilitychange', refresh)
    return () => { active = false; window.clearInterval(interval); document.removeEventListener('visibilitychange', refresh) }
  }, [current?.activeOrganizationId])

  useEffect(() => {
    if (!notificationToast) return
    const timeout = window.setTimeout(() => setNotificationToast(null), 7000)
    return () => window.clearTimeout(timeout)
  }, [notificationToast])

  const chooseOrganization = async (organizationId: string) => {
    if (organizationId === current?.activeOrganizationId || changingOrganization) return
    setChangingOrganization(true)
    setOrganizationSwitchError(false)
    try {
      if (current?.platformOrganizationContext) setPlatformOrganizationContext(null)
      const result = await api.auth.setActiveOrganization(organizationId)
      if (result.error) throw new Error('Organization switch failed')
      const refreshedSession = await api.session.get()
      setCurrent(refreshedSession)
      setNotifications([])
      notificationIdsRef.current = new Set()
      setUnreadNotificationCount(0)
      setNotificationsActionError(false)
      notificationRefreshRevision.current += 1
      notificationsLoadedRef.current = false
      const defaultRoles = getOrganizationRoles(refreshedSession.activeOrganizationRole)
      const defaultPage = defaultRoles.map((role) => roleDefaultPages[role]).find((candidate) => candidate !== undefined) ?? 'home'
      navigateToPage(defaultPage, {}, { replace: true })
      setMobileMenuOpen(false)
    } catch {
      if (current?.platformOrganizationContext && current.platformOrganization) setPlatformOrganizationContext(current.platformOrganization.id)
      setOrganizationSwitchError(true)
    } finally {
      setChangingOrganization(false)
    }
  }

  const openPlatformOrganization = async (organizationId: string) => {
    if (changingOrganization) return
    setChangingOrganization(true)
    setOrganizationSwitchError(false)
    setPlatformOrganizationContext(organizationId)
    try {
      const refreshedSession = await api.session.get()
      if (!refreshedSession.platformOrganizationContext || refreshedSession.activeOrganizationId !== organizationId) throw new Error('Company context was not authorized')
      setCurrent(refreshedSession)
      setNotifications([])
      notificationIdsRef.current = new Set()
      setUnreadNotificationCount(0)
      setNotificationsActionError(false)
      notificationRefreshRevision.current += 1
      notificationsLoadedRef.current = false
      navigate(pagePaths.home, { replace: true })
    } catch {
      setPlatformOrganizationContext(null)
      setOrganizationSwitchError(true)
    } finally {
      setChangingOrganization(false)
    }
  }

  const activeOrganization = current?.organizations.find((organization) => organization.id === current.activeOrganizationId) ?? current?.platformOrganization ?? null
  const selectableOrganizations = current?.platformOrganizationContext && current.platformOrganization
    ? [...current.organizations, ...(current.organizations.some((organization) => organization.id === current.platformOrganization?.id) ? [] : [current.platformOrganization])]
    : current?.organizations ?? []
  const toggleLocale = () => { void i18n.changeLanguage(i18n.language === 'pt-BR' ? 'en' : 'pt-BR') }
  const markAllNotificationsRead = async () => {
    if (markingNotificationsRead || unreadNotificationCount === 0) return
    setMarkingNotificationsRead(true)
    setNotificationsActionError(false)
    try {
      await api.notifications.markAllRead()
      notificationRefreshRevision.current += 1
      setNotifications([])
      setUnreadNotificationCount(0)
      setNotificationsError(false)
      notificationsLoadedRef.current = true
    } catch { setNotificationsActionError(true) }
    finally { setMarkingNotificationsRead(false) }
  }
  const openNotification = async (notification: UserNotificationDto) => {
    try {
      await api.notifications.markRead(notification.id)
      notificationRefreshRevision.current += 1
      setNotifications((items) => items.filter((item) => item.id !== notification.id))
      setUnreadNotificationCount((count) => Math.max(0, count - 1))
      setNotificationsOpen(false)
      if (notification.taskId) navigateToPage('tasks', { taskId: notification.taskId })
      else if (notification.handoffId) navigateToPage('handoffs', { handoffId: notification.handoffId, status: notification.notificationType === 'handoff_returned' ? 'returned' : 'accepted' })
      else if (notification.opportunityId) navigateToPage('pipeline', { opportunityId: notification.opportunityId })
      else if (notification.channelId) navigateToPage('channels')
      else if (notification.conversationId) navigateToPage('inbox', { conversationId: notification.conversationId })
    } catch { setNotificationsError(true) }
  }

  if (loading) return <main className="access-shell">
    <section className="access-card access-loading" aria-label={t('common.workspace')}>
      <div className="access-brand"><img src="/brand-kit/logos/logo-default.svg" alt="30Sales" /></div>
      <WorkspaceState kind="loading" compact message={t('common.loading')} />
    </section>
  </main>

  if (error || !current) return <main className="access-shell">
    <section className="access-card" aria-labelledby="access-title">
      <div className="access-brand"><img src="/brand-kit/logos/logo-default.svg" alt="30Sales" /></div>
      <p className="eyebrow">{t('home.accessEyebrow')}</p>
      <Login onError={setError} />
      {error !== 'authRequired' && error && <p className="access-error" role="alert">{error}</p>}
    </section>
  </main>

  const isPlatformAdmin = current.user.platformRole === PLATFORM_ROLE.superAdmin
  const hasActiveMembership = current.activeOrganizationId !== null && current.organizations.some((organization) => organization.id === current.activeOrganizationId)
  if (isPlatformAdmin && (location.pathname === '/platform' || (!hasActiveMembership && !current.platformOrganizationContext))) return <PlatformWorkspace user={current.user} organizations={current.organizations} onOpenOrganization={(organizationId) => void chooseOrganization(organizationId)} onSelectOrganization={(organizationId) => void openPlatformOrganization(organizationId)} onSignOut={async () => { setPlatformOrganizationContext(null); await api.auth.signOut(); window.location.reload() }} />

  if (!current.activeOrganizationId) return <main className="access-shell">
    <section className="access-card" aria-labelledby="access-title">
      <div className="access-brand"><img src="/brand-kit/logos/logo-default.svg" alt="30Sales" /></div>
      <p className="eyebrow">{t('home.chooseEyebrow')}</p>
      <h1 id="access-title">{t('home.chooseTitle')}</h1>
      <p className="muted">{t('home.chooseHint')}</p>
      <div className="org-list">{current.organizations.map((organization) => <Button key={organization.id} onClick={() => void chooseOrganization(organization.id)} disabled={changingOrganization}>
        <Building2 size={18} aria-hidden="true" /><span>{organization.name}<small>{organization.slug}</small></span><ArrowRight size={17} aria-hidden="true" />
      </Button>)}</div>
      {organizationSwitchError && <p className="access-error" role="alert">{t('errors.requestFailed')}</p>}
    </section>
  </main>

  return <main className="shell">
    <aside className="rail">
      <div className="brand"><img className="brand-wordmark" src="/brand-kit/logos/logo-default.svg" alt="30Sales" /></div>
      <Button className="mobile-nav-toggle" type="button" aria-label={t(mobileMenuOpen ? 'common.closeNavigation' : 'common.openNavigation')} aria-controls="primary-navigation" aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen((open) => !open)}>
        {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
      </Button>
      <nav id="primary-navigation" className={`nav-items ${mobileMenuOpen ? 'open' : ''}`} aria-label={t('common.workspace')} onClick={() => setMobileMenuOpen(false)}>
        {([ 'home', 'tasks' ] as Page[]).some(canViewPage) && <div className="nav-group" role="group" aria-label={t('common.navGroups.daily')}><span className="nav-group-title">{t('common.navGroups.daily')}</span>
          {canViewPage('home') && <Button className={`nav ${page === 'home' ? 'active' : ''}`} aria-current={page === 'home' ? 'page' : undefined} onClick={() => navigateToPage('home')}><CalendarClock size={18} />{t('common.home')}</Button>}
          {canViewPage('tasks') && <Button className={`nav ${page === 'tasks' ? 'active' : ''}`} aria-current={page === 'tasks' ? 'page' : undefined} onClick={() => navigateToPage('tasks')}><ListTodo size={18} />{t('common.tasksNav')}</Button>}
        </div>}
        {([ 'inbox', 'leads', 'accounts' ] as Page[]).some(canViewPage) && <div className="nav-group" role="group" aria-label={t('common.navGroups.customers')}><span className="nav-group-title">{t('common.navGroups.customers')}</span>
          {canViewPage('inbox') && <Button className={`nav ${page === 'inbox' ? 'active' : ''}`} aria-current={page === 'inbox' ? 'page' : undefined} onClick={() => navigateToPage('inbox')}><MessageSquareText size={18} />{t('common.inboxNav')}{notifications.filter((notification) => notification.notificationType === USER_NOTIFICATION_TYPE.inboxNewMessage || notification.notificationType === USER_NOTIFICATION_TYPE.conversationAssigned).length > 0 && <span className="nav-count">{notifications.filter((notification) => notification.notificationType === USER_NOTIFICATION_TYPE.inboxNewMessage || notification.notificationType === USER_NOTIFICATION_TYPE.conversationAssigned).length}</span>}</Button>}
          {canViewPage('leads') && <Button className={`nav ${page === 'leads' ? 'active' : ''}`} aria-current={page === 'leads' ? 'page' : undefined} onClick={() => navigateToPage('leads')}><Users size={18} />{t('common.leadsNav')}</Button>}
          {canViewPage('accounts') && <Button className={`nav ${page === 'accounts' ? 'active' : ''}`} aria-current={page === 'accounts' ? 'page' : undefined} onClick={() => navigateToPage('accounts')}><Building2 size={18} />{t('common.accountsNav')}</Button>}
        </div>}
        {([ 'closerQueue', 'handoffs', 'pipeline' ] as Page[]).some(canViewPage) && <div className="nav-group" role="group" aria-label={t('common.navGroups.sales')}><span className="nav-group-title">{t('common.navGroups.sales')}</span>
          {canViewPage('closerQueue') && <Button className={`nav ${page === 'closerQueue' ? 'active' : ''}`} aria-current={page === 'closerQueue' ? 'page' : undefined} onClick={() => navigateToPage('closerQueue')}><Briefcase size={18} />{t('common.closerQueueNav')}</Button>}
          {canViewPage('handoffs') && <Button className={`nav ${page === 'handoffs' ? 'active' : ''}`} aria-current={page === 'handoffs' ? 'page' : undefined} onClick={() => navigateToPage('handoffs')}><UserRoundCheck size={18} />{t('common.handoffsNav')}</Button>}
          {canViewPage('pipeline') && <Button className={`nav ${page === 'pipeline' ? 'active' : ''}`} aria-current={page === 'pipeline' ? 'page' : undefined} onClick={() => navigateToPage('pipeline')}><TrendingUp size={18} />{t('common.pipelineNav')}</Button>}
        </div>}
        {([ 'channels', 'assistant', 'closerSla', 'reports', 'audit', 'imports', 'team' ] as Page[]).some(canViewPage) || isPlatformAdmin ? <div className="nav-group" role="group" aria-label={t('common.navGroups.management')}><span className="nav-group-title">{t('common.navGroups.management')}</span>
          {canViewPage('channels') && <Button className={`nav ${page === 'channels' ? 'active' : ''}`} aria-current={page === 'channels' ? 'page' : undefined} onClick={() => navigateToPage('channels')}><Radio size={18} />{t('common.channelsNav')}</Button>}
          {canViewPage('assistant') && <Button className={`nav ${page === 'assistant' ? 'active' : ''}`} aria-current={page === 'assistant' ? 'page' : undefined} onClick={() => navigateToPage('assistant')}><Bot size={18} />{t('assistantSettings.nav')}</Button>}
          {canViewPage('closerSla') && <Button className={`nav ${page === 'closerSla' ? 'active' : ''}`} aria-current={page === 'closerSla' ? 'page' : undefined} onClick={() => navigateToPage('closerSla')}><CalendarClock size={18} />{t('closerSlaSettings.nav')}</Button>}
          {canViewPage('reports') && <Button className={`nav ${page === 'reports' ? 'active' : ''}`} aria-current={page === 'reports' ? 'page' : undefined} onClick={() => navigateToPage('reports')}><BarChart3 size={18} />{t('funnelReport.nav')}</Button>}
          {canViewPage('audit') && <Button className={`nav ${page === 'audit' ? 'active' : ''}`} aria-current={page === 'audit' ? 'page' : undefined} onClick={() => navigateToPage('audit')}><ShieldCheck size={18} />{t('common.auditNav')}</Button>}
          {canViewPage('imports') && <Button className={`nav ${page === 'imports' ? 'active' : ''}`} aria-current={page === 'imports' ? 'page' : undefined} onClick={() => navigateToPage('imports')}><Database size={18} />{t('common.importsNav')}</Button>}
          {canViewPage('team') && <Button className={`nav ${page === 'team' ? 'active' : ''}`} aria-current={page === 'team' ? 'page' : undefined} onClick={() => navigateToPage('team')}><Users size={18} />{t('common.teamNav')}</Button>}
          {isPlatformAdmin && <Button className="nav" type="button" onClick={() => { navigate('/platform'); setMobileMenuOpen(false) }}><ShieldCheck size={18} />{t('platform.nav')}</Button>}
        </div> : null}
      </nav>
      <div className="rail-bottom">
        <span className="avatar">{current?.user.name.slice(0, 1) ?? 'S'}</span>
        <div><strong>{current?.user.name ?? t('common.account')}</strong><small>{current?.user.email ?? t('common.secureAccess')}</small></div>
      </div>
    </aside>
    <section className="main">
      {notificationToast && <div className="notification-toast" role="status"><Bell size={17} /><Button type="button" onClick={() => { void openNotification(notificationToast); setNotificationToast(null) }}><strong>{t('systemNotifications.newActivity')}</strong><small>{notificationToast.contactName ?? notificationToast.accountName ?? notificationToast.summary}</small></Button><button type="button" aria-label={t('common.close')} onClick={() => setNotificationToast(null)}><X size={15} /></button></div>}
      <header>
        <div className="ui-visually-hidden"><span className="eyebrow">{t(`${pageTranslationKeys[page]}.eyebrow`)}</span><h1>{t(`${pageTranslationKeys[page]}.title`)}</h1></div>
        <div className="account">
          <Button className="language-toggle" onClick={toggleLocale} aria-label={t('common.languageToggleLabel')}>{i18n.language === 'pt-BR' ? 'EN' : 'PT'}</Button>
          {current?.activeOrganizationId && <div className="notification-menu">
            <Button className="notification-trigger" type="button" aria-label={t('systemNotifications.open', { count: unreadNotificationCount })} aria-expanded={notificationsOpen} onClick={() => setNotificationsOpen((open) => !open)}>
              <Bell size={18} />{unreadNotificationCount > 0 && <span className="notification-count">{unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}</span>}
            </Button>
            {notificationsOpen && <section className="notification-panel" aria-label={t('systemNotifications.title')}>
              <div className="notification-panel-heading"><div className="notification-heading-copy"><strong>{t('systemNotifications.title')}</strong><span>{t('systemNotifications.unread', { count: unreadNotificationCount })}</span></div>{unreadNotificationCount > 0 && <Button className="notification-mark-all" type="button" disabled={markingNotificationsRead} onClick={() => void markAllNotificationsRead()}>{markingNotificationsRead ? t('systemNotifications.markingAllRead') : t('systemNotifications.markAllRead')}</Button>}</div>
              {notificationsActionError && <WorkspaceState kind="error" compact message={t('systemNotifications.markAllFailed')} />}
              {notificationsError && notifications.length > 0 && <WorkspaceState kind="error" compact message={t('systemNotifications.loadFailed')} detail={t('table.resultsRetained')} />}
              {notificationsLoading && notifications.length === 0 ? <WorkspaceState kind="loading" compact message={t('common.loading')} /> : notifications.length === 0 ? notificationsError ? <WorkspaceState kind="error" compact message={t('systemNotifications.loadFailed')} /> : <WorkspaceState kind="empty" compact message={t('systemNotifications.empty')} /> : notifications.map((notification) => <Button className="notification-item" key={notification.id} type="button" onClick={() => void openNotification(notification)}>
                <span className={`notification-item-title${notification.notificationType === USER_NOTIFICATION_TYPE.inboxNewMessage || notification.notificationType === USER_NOTIFICATION_TYPE.conversationAssigned ? ' is-inbox' : notification.notificationType === USER_NOTIFICATION_TYPE.messageDeliveryFailed || notification.notificationType === USER_NOTIFICATION_TYPE.channelDisconnected ? ' is-error' : ''}`}>{notification.notificationType === USER_NOTIFICATION_TYPE.inboxNewMessage ? t('systemNotifications.newMessage') : notification.notificationType === USER_NOTIFICATION_TYPE.messageDeliveryFailed ? t('systemNotifications.messageDeliveryFailed') : notification.notificationType === USER_NOTIFICATION_TYPE.taskOverdue ? t('systemNotifications.taskOverdue') : notification.notificationType === USER_NOTIFICATION_TYPE.handoffAccepted ? t('systemNotifications.handoffAccepted') : notification.notificationType === USER_NOTIFICATION_TYPE.handoffReturned ? t('systemNotifications.handoffReturned') : notification.notificationType === USER_NOTIFICATION_TYPE.conversationAssigned ? t('systemNotifications.conversationAssigned') : notification.notificationType === USER_NOTIFICATION_TYPE.opportunityAssigned ? t('systemNotifications.opportunityAssigned') : notification.notificationType === USER_NOTIFICATION_TYPE.channelDisconnected ? t('systemNotifications.channelDisconnected') : t(`closerSlaSettings.notifications.${notification.notificationType === USER_NOTIFICATION_TYPE.closerEventSlaEscalated ? 'escalated' : 'overdue'}`)}</span>
                <span>{notification.notificationType === 'inbox_new_message' || notification.notificationType === 'conversation_assigned' ? [notification.contactName, notification.accountName].filter(Boolean).join(' · ') || notification.summary : notification.notificationType === 'task_overdue' ? [notification.taskTitle, notification.contactName, notification.accountName].filter(Boolean).join(' · ') || notification.summary : notification.handoffId ? [notification.contactName, notification.accountName, notification.summary].filter(Boolean).join(' · ') : notification.opportunityId ? [notification.contactName, notification.accountName, notification.summary].filter(Boolean).join(' · ') : notification.accountName ?? notification.summary}</span>
                <small>{notification.eventType ? `${t(`closerEventTypes.${notification.eventType}`)} · ` : ''}{new Intl.DateTimeFormat(i18n.language, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(notification.dueAt ?? notification.createdAt))}</small>
                <span className="notification-open">{notification.channelId ? t('systemNotifications.openChannels') : notification.taskId ? t('systemNotifications.openTask') : notification.handoffId ? t('systemNotifications.openHandoff') : notification.opportunityId ? t('systemNotifications.openOpportunity') : t('systemNotifications.openConversation')} <ArrowRight size={13} /></span>
              </Button>)}
            </section>}
          </div>}
          {activeOrganization && <div className="workspace-selector-wrap">
            <div className="workspace workspace-selector"><Building2 size={16} /><SelectField aria-label={t('common.activeOrganization')} value={activeOrganization.id} disabled={changingOrganization || selectableOrganizations.length < 2} onChange={(event) => void chooseOrganization(event.target.value)}>
              {selectableOrganizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
            </SelectField><ChevronDown size={15} aria-hidden="true" /></div>
            {organizationSwitchError && <span className="workspace-error" role="alert">{t('errors.requestFailed')}</span>}
          </div>}
          <span className="avatar small">{current?.user.name.slice(0, 1) ?? 'S'}</span>
        </div>
      </header>
      <div className="content" key={current?.activeOrganizationId ?? 'no-organization'}>
        <Breadcrumbs items={breadcrumbItems} label={t('common.breadcrumbLabel')} />
        {page === 'closerSla' ? <CloserSlaSettingsWorkspace />
          : page === 'pipelineStages' ? <PipelineStagesWorkspace onBack={() => navigateToPage('pipeline')} />
          : page === 'team' && current?.activeOrganizationId ? <TeamSettings organizationId={current.activeOrganizationId} />
          : page === 'closerQueue' ? <CloserQueueWorkspace userId={current.user.id} onOpenPipeline={() => navigateToPage('pipeline')} onOpenInbox={(conversationId) => navigateToPage('inbox', { conversationId })} onOpenTask={(taskId) => navigateToPage('tasks', { taskId })} />
          : page === 'channels' ? <ChannelsWorkspace />
          : page === 'assistant' ? <AssistantSettingsWorkspace />
          : page === 'inbox' ? <InboxWorkspace initialSearch={inboxSearchSeed} initialConversationId={inboxConversationSeed} />
          : page === 'leads' ? <LeadsWorkspace initialSearch={leadSearchSeed} />
          : page === 'accounts' ? <AccountsWorkspace onOpenLeads={(name) => navigateToPage('leads', { search: name })} canManageSegments={canManageSegments} canUpdateProfile={canUpdateAccountProfile} />
            : page === 'tasks' ? <TasksWorkspace />
            : page === 'handoffs' ? <HandoffsWorkspace />
              : page === 'pipeline' ? <PipelineWorkspace />
              : page === 'reports' ? <FunnelReportWorkspace />
                : page === 'audit' ? <AuditWorkspace />
                  : page === 'imports' ? <ImportsWorkspace />
            : <TodayWorkspace userId={current.user.id} navigate={navigateToPage} />}
      </div>
    </section>
  </main>
}

function Login({ onError }: { onError: (message: string) => void }) {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(true)
  const [busy, setBusy] = useState(false)
  const [requestingReset, setRequestingReset] = useState(false)
  const [resetRequested, setResetRequested] = useState(false)
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    onError('')
    try {
      if (requestingReset) {
        const result = await api.auth.requestPasswordReset({ email, redirectTo: `${window.location.origin}/reset-password` })
        if (result.error) onError(t('auth.resetRequestFailed'))
        else setResetRequested(true)
        return
      }
      const result = await api.auth.signInEmail({ email, password, rememberMe })
      if (result.error) onError(t('auth.failedSignIn'))
      else window.location.reload()
    } catch {
      onError(requestingReset ? t('auth.resetRequestFailed') : t('auth.failedSignIn'))
    } finally {
      setBusy(false)
    }
  }
  return <>
    <h1 id="access-title">{requestingReset ? t('auth.resetRequestTitle') : t('home.signInTitle')}</h1>
    <p className="muted">{requestingReset ? t('auth.resetRequestHint') : t('home.signInHint')}</p>
    {requestingReset ? resetRequested ? <div className="auth-reset-confirmation" role="status">
      <p>{t('auth.resetRequestSent')}</p>
      <Button type="button" className="text-button" onClick={() => { setRequestingReset(false); setResetRequested(false); onError('') }}>{t('auth.backToSignIn')}</Button>
    </div> : <form className="login-form" onSubmit={submit}>
      <label>{t('common.email')}<TextField type="email" normalize="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
      <Button className="primary" disabled={busy}>{busy ? t('auth.sendingResetLink') : t('auth.sendResetLink')}<ArrowRight size={16} /></Button>
      <Button type="button" className="text-button" onClick={() => { setRequestingReset(false); onError('') }}>{t('auth.backToSignIn')}</Button>
    </form> : <form className="login-form" onSubmit={submit}>
      <label>{t('common.email')}<TextField type="email" normalize="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
      <label>{t('auth.password')}<TextField type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
      <div className="login-options"><label className="remember-option"><CheckboxField checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} />{t('auth.rememberMe')}</label><Button type="button" className="text-button" onClick={() => { setRequestingReset(true); onError('') }}>{t('auth.forgotPassword')}</Button></div>
      <Button className="primary" disabled={busy}>{busy ? t('auth.signingIn') : t('auth.signIn')}<ArrowRight size={16} /></Button>
    </form>}
  </>
}
