import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, BarChart3, Bell, Building2, ListTodo, MessageSquareText, TrendingUp, UserRoundCheck, Users, ShieldCheck, Database, CalendarClock, Briefcase, Radio, Bot, Menu, X, ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { WorkspaceState } from './components/ui/WorkspaceState'
import { Button } from './components/ui/Button'
import { Breadcrumbs } from './components/ui/Breadcrumbs'
import { api } from './lib/api/api'
import type { BusinessLineDto, SessionDto, UserNotificationDto } from './lib/api/contracts'
import { USER_NOTIFICATION_TYPE } from './lib/api/notificationConstants'
import { setPlatformOrganizationContext } from './lib/api/client'
import i18n from './lib/i18n'
import { getOrganizationRoles, ORGANIZATION_PROFILE_UPDATE_ROLES, ORGANIZATION_ROLE, ORGANIZATION_SEGMENT_MANAGEMENT_ROLES, PLATFORM_ROLE } from './lib/authorizationConstants'
import './App.css'
import './polish.css'

const TeamSettings = lazy(() => import('./features/TeamSettings').then((module) => ({ default: module.TeamSettings })))
const LeadsWorkspace = lazy(() => import('./features/LeadsWorkspace').then((module) => ({ default: module.LeadsWorkspace })))
const TasksWorkspace = lazy(() => import('./features/TasksWorkspace').then((module) => ({ default: module.TasksWorkspace })))
const HandoffsWorkspace = lazy(() => import('./features/HandoffsWorkspace').then((module) => ({ default: module.HandoffsWorkspace })))
const PipelineWorkspace = lazy(() => import('./features/PipelineWorkspace').then((module) => ({ default: module.PipelineWorkspace })))
const InboxWorkspace = lazy(() => import('./features/InboxWorkspace').then((module) => ({ default: module.InboxWorkspace })))
const AuditWorkspace = lazy(() => import('./features/AuditWorkspace').then((module) => ({ default: module.AuditWorkspace })))
const ImportsWorkspace = lazy(() => import('./features/ImportsWorkspace').then((module) => ({ default: module.ImportsWorkspace })))
const TodayWorkspace = lazy(() => import('./features/TodayWorkspace').then((module) => ({ default: module.TodayWorkspace })))
const FunnelReportWorkspace = lazy(() => import('./features/FunnelReportWorkspace').then((module) => ({ default: module.FunnelReportWorkspace })))
const AccountsWorkspace = lazy(() => import('./features/AccountsWorkspace').then((module) => ({ default: module.AccountsWorkspace })))
const CloserQueueWorkspace = lazy(() => import('./features/CloserQueueWorkspace').then((module) => ({ default: module.CloserQueueWorkspace })))
const ChannelsWorkspace = lazy(() => import('./features/ChannelsWorkspace').then((module) => ({ default: module.ChannelsWorkspace })))
const AssistantSettingsWorkspace = lazy(() => import('./features/AssistantSettingsWorkspace').then((module) => ({ default: module.AssistantSettingsWorkspace })))
const CloserSlaSettingsWorkspace = lazy(() => import('./features/CloserSlaSettingsWorkspace').then((module) => ({ default: module.CloserSlaSettingsWorkspace })))
const PipelineStagesWorkspace = lazy(() => import('./features/PipelineStagesWorkspace').then((module) => ({ default: module.PipelineStagesWorkspace })))
const PlatformWorkspace = lazy(() => import('./features/PlatformWorkspace').then((module) => ({ default: module.PlatformWorkspace })))
const BusinessLinesWorkspace = lazy(() => import('./features/BusinessLinesWorkspace').then((module) => ({ default: module.BusinessLinesWorkspace })))
const PlatformOrganizationPicker = lazy(() => import('./features/PlatformOrganizationPicker').then((module) => ({ default: module.PlatformOrganizationPicker })))
const LoginWorkspace = lazy(() => import('./features/LoginWorkspace').then((module) => ({ default: module.LoginWorkspace })))

type Page = 'home' | 'closerQueue' | 'closerSla' | 'pipelineStages' | 'inbox' | 'leads' | 'accounts' | 'channels' | 'assistant' | 'tasks' | 'handoffs' | 'pipeline' | 'reports' | 'audit' | 'imports' | 'team' | 'businessLines'
const pagePaths: Record<Page, string> = {
  home: '/today', closerQueue: '/closer', closerSla: '/settings/closer-sla', pipelineStages: '/settings/pipeline',
  inbox: '/inbox', leads: '/leads', accounts: '/accounts', channels: '/settings/channels',
  assistant: '/settings/assistant', tasks: '/tasks', handoffs: '/handoffs', pipeline: '/pipeline',
  reports: '/reports/funnel', audit: '/settings/audit', imports: '/settings/imports', team: '/settings/team', businessLines: '/settings/business-lines',
}
const pagesByPath: Record<string, Page> = {
  '/today': 'home', '/closer': 'closerQueue', '/settings/closer-sla': 'closerSla', '/settings/pipeline': 'pipelineStages',
  '/inbox': 'inbox', '/leads': 'leads', '/accounts': 'accounts', '/settings/channels': 'channels',
  '/settings/assistant': 'assistant', '/tasks': 'tasks', '/handoffs': 'handoffs', '/pipeline': 'pipeline',
  '/reports/funnel': 'reports', '/settings/audit': 'audit', '/settings/imports': 'imports', '/settings/team': 'team', '/settings/business-lines': 'businessLines',
}
const EMPTY_BUSINESS_LINES: BusinessLineDto[] = []
const navigationPageGroups = {
  daily: ['home', 'tasks'], customers: ['inbox', 'leads', 'accounts'], sales: ['closerQueue', 'handoffs', 'pipeline'],
  configuration: ['channels', 'assistant', 'closerSla', 'pipelineStages', 'businessLines'],
  management: ['reports', 'audit', 'imports', 'team'],
} as const satisfies Record<'daily' | 'customers' | 'sales' | 'configuration' | 'management', readonly Page[]>
type NavigationGroup = keyof typeof navigationPageGroups
function navigationGroupForPage(page: Page): NavigationGroup | null {
  return (Object.keys(navigationPageGroups) as NavigationGroup[]).find((group) => navigationPageGroups[group].some((candidate) => candidate === page)) ?? null
}
const rolePages: Record<string, readonly Page[]> = {
  [ORGANIZATION_ROLE.owner]: ['home', 'closerQueue', 'closerSla', 'pipelineStages', 'inbox', 'leads', 'accounts', 'channels', 'assistant', 'tasks', 'handoffs', 'pipeline', 'reports', 'audit', 'imports', 'team', 'businessLines'],
  [ORGANIZATION_ROLE.admin]: ['home', 'closerQueue', 'closerSla', 'pipelineStages', 'inbox', 'leads', 'accounts', 'channels', 'assistant', 'tasks', 'handoffs', 'pipeline', 'reports', 'audit', 'imports', 'team', 'businessLines'],
  [ORGANIZATION_ROLE.manager]: ['home', 'closerQueue', 'closerSla', 'pipelineStages', 'inbox', 'leads', 'accounts', 'channels', 'assistant', 'tasks', 'handoffs', 'pipeline', 'reports', 'audit', 'imports', 'team', 'businessLines'],
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
const pageTranslationKeys: Record<Page, string> = {
  home: 'today', closerQueue: 'closerQueue', closerSla: 'closerSlaSettings', pipelineStages: 'pipelineStageSettings', inbox: 'inbox', leads: 'leads',
  accounts: 'accounts', channels: 'channels', assistant: 'assistantSettings', tasks: 'tasks', handoffs: 'handoffs',
  pipeline: 'pipeline', reports: 'funnelReport', audit: 'audit', imports: 'imports', team: 'team', businessLines: 'businessLines',
}
const notificationTitleKeys: Record<UserNotificationDto['notificationType'], string> = {
  closer_event_sla_overdue: 'closerSlaSettings.notifications.overdue',
  closer_event_sla_escalated: 'closerSlaSettings.notifications.escalated',
  inbox_new_message: 'systemNotifications.newMessage',
  message_delivery_failed: 'systemNotifications.messageDeliveryFailed',
  task_overdue: 'systemNotifications.taskOverdue',
  handoff_accepted: 'systemNotifications.handoffAccepted',
  handoff_returned: 'systemNotifications.handoffReturned',
  conversation_assigned: 'systemNotifications.conversationAssigned',
  opportunity_assigned: 'systemNotifications.opportunityAssigned',
  channel_disconnected: 'systemNotifications.channelDisconnected',
}
const breadcrumbGroupKeys: Partial<Record<Page, string>> = {
  home: 'common.navGroups.daily', tasks: 'common.navGroups.daily', inbox: 'common.navGroups.customers', leads: 'common.navGroups.customers', accounts: 'common.navGroups.customers',
  closerQueue: 'common.navGroups.sales', handoffs: 'common.navGroups.sales', pipeline: 'common.navGroups.sales',
  pipelineStages: 'common.navGroups.configuration', channels: 'common.navGroups.configuration', assistant: 'common.navGroups.configuration', closerSla: 'common.navGroups.configuration', businessLines: 'common.navGroups.configuration',
  reports: 'common.navGroups.management', audit: 'common.navGroups.management', imports: 'common.navGroups.management', team: 'common.navGroups.management',
}

export default function App() {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const [current, setCurrent] = useState<SessionDto | null>(null)
  const [businessLinesResult, setBusinessLinesResult] = useState<{ organizationId: string; data: BusinessLineDto[]; failed: boolean } | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const page = pagesByPath[location.pathname] ?? 'home'
  const activeRole = current?.activeOrganizationRole ?? ''
  const activeRoles = getOrganizationRoles(activeRole)
  const canViewAllBusinessLines = activeRoles.some((role) => ORGANIZATION_SEGMENT_MANAGEMENT_ROLES.some((managerRole) => managerRole === role))
  const canManageSegments = activeRoles.some((role) => ORGANIZATION_SEGMENT_MANAGEMENT_ROLES.some((managementRole) => managementRole === role))
  const canUpdateAccountProfile = activeRoles.some((role) => ORGANIZATION_PROFILE_UPDATE_ROLES.some((updateRole) => updateRole === role))
  const activeDefaultPage = activeRoles.map((role) => roleDefaultPages[role]).find((defaultPage) => defaultPage !== undefined) ?? 'home'
  const allowedPages = [...new Set(activeRoles.flatMap((role) => rolePages[role] ?? []))]
  const canViewPage = (target: Page) => Boolean(current?.platformOrganizationContext || allowedPages.includes(target))
  const canViewCurrentPage = canViewPage(page)
  const breadcrumbItems = page === 'home'
    ? []
    : [
      { label: t('common.breadcrumbRoot'), href: pagePaths[activeDefaultPage] },
      { label: t(breadcrumbGroupKeys[page] ?? 'common.navGroups.daily') },
      ...(page === 'pipelineStages' ? [{ label: t('common.pipelineNav'), href: pagePaths.pipeline }] : []),
    ]
  const searchParams = new URLSearchParams(location.search)
  const businessLinesOrganizationId = current?.activeOrganizationId ?? current?.platformOrganization?.id ?? ''
  const businessLinesLoaded = !businessLinesOrganizationId || businessLinesResult?.organizationId === businessLinesOrganizationId
  const allBusinessLines = businessLinesResult?.organizationId === businessLinesOrganizationId ? businessLinesResult.data : EMPTY_BUSINESS_LINES
  const businessLines = allBusinessLines.filter((line) => line.status === 'active')
  const businessLinesLoadFailed = businessLinesResult?.organizationId === businessLinesOrganizationId && businessLinesResult.failed
  const leadSearchSeed = page === 'leads' ? searchParams.get('search') ?? '' : ''
  const inboxSearchSeed = page === 'inbox' ? searchParams.get('search') ?? '' : ''
  const inboxConversationSeed = page === 'inbox' ? searchParams.get('conversationId') ?? '' : ''
  const [notifications, setNotifications] = useState<UserNotificationDto[]>([])
  const [notificationToast, setNotificationToast] = useState<UserNotificationDto | null>(null)
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notificationsError, setNotificationsError] = useState(false)
  const [notificationsActionError, setNotificationsActionError] = useState(false)
  const [notificationOpenError, setNotificationOpenError] = useState(false)
  const [notificationsLoading, setNotificationsLoading] = useState(false)
  const [markingNotificationsRead, setMarkingNotificationsRead] = useState(false)
  const notificationsLoadedRef = useRef(false)
  const notificationIdsRef = useRef<Set<string>>(new Set())
  const notificationRefreshRevision = useRef(0)
  const notificationScopeRevision = useRef(0)
  const notificationRequestId = useRef(0)
  const notificationRequestsInFlight = useRef(new Map<string, number>())
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [navigationGroupOverride, setNavigationGroupOverride] = useState<{ page: Page; group: NavigationGroup | null } | null>(null)
  const [changingOrganization, setChangingOrganization] = useState(false)
  const [organizationSwitchError, setOrganizationSwitchError] = useState(false)
  const activeBusinessLineId = searchParams.get('businessLineId') ?? ''
  const expandedNavigationGroup = navigationGroupOverride?.page === page ? navigationGroupOverride.group : navigationGroupForPage(page)

  const navigateToPage = (targetPage: Page, query: Record<string, string | null | undefined> = {}, options: { replace?: boolean } = {}) => {
    const params = new URLSearchParams()
    const lineId = query.businessLineId === undefined ? activeBusinessLineId : query.businessLineId ?? ''
    if (lineId) params.set('businessLineId', lineId)
    Object.entries(query).forEach(([key, value]) => { if (value) params.set(key, value) })
    const queryString = params.toString()
    navigate({ pathname: pagePaths[targetPage], search: queryString ? `?${queryString}` : '' }, options)
    setMobileMenuOpen(false)
  }

  const clearNotificationScope = () => {
    notificationScopeRevision.current += 1
    notificationRefreshRevision.current += 1
    notificationRequestsInFlight.current.clear()
    notificationsLoadedRef.current = false
    notificationIdsRef.current = new Set()
    setNotifications([])
    setNotificationToast(null)
    setUnreadNotificationCount(0)
    setNotificationsOpen(false)
    setNotificationsError(false)
    setNotificationsActionError(false)
    setNotificationOpenError(false)
    setNotificationsLoading(false)
    setMarkingNotificationsRead(false)
  }

  useEffect(() => {
    api.session.get().then((session) => {
      if (!session.platformOrganizationContext) setPlatformOrganizationContext(null)
      setCurrent(session)
    }).catch(() => setError('authRequired')).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!businessLinesOrganizationId) return
    let active = true
    api.businessLines.list().then((result) => { if (active) setBusinessLinesResult({ organizationId: businessLinesOrganizationId, data: result.data, failed: false }) })
      .catch(() => { if (active) setBusinessLinesResult({ organizationId: businessLinesOrganizationId, data: [], failed: true }) })
    return () => { active = false }
  }, [businessLinesOrganizationId])

  useEffect(() => {
    if (businessLinesLoaded && activeBusinessLineId && !businessLines.some((line) => line.id === activeBusinessLineId)) {
      const params = new URLSearchParams(location.search)
      params.delete('businessLineId')
      navigate({ pathname: location.pathname, search: params.toString() ? `?${params}` : '' }, { replace: true })
    }
  }, [activeBusinessLineId, businessLines, businessLinesLoaded, location.pathname, location.search, navigate])

  useEffect(() => {
    if (!businessLinesLoaded || canViewAllBusinessLines || activeBusinessLineId || businessLines.length === 0) return
    const params = new URLSearchParams(location.search)
    params.set('businessLineId', businessLines[0].id)
    navigate({ pathname: location.pathname, search: `?${params}` }, { replace: true })
  }, [activeBusinessLineId, businessLines, businessLinesLoaded, canViewAllBusinessLines, location.pathname, location.search, navigate])

  useEffect(() => {
    if (!current) return
    if (location.pathname === '/platform' && current.user.platformRole === PLATFORM_ROLE.superAdmin) return
    if (!pagesByPath[location.pathname] || !canViewCurrentPage) navigate(pagePaths[activeDefaultPage], { replace: true })
  }, [activeDefaultPage, canViewCurrentPage, current, location.pathname, navigate])

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
      const organizationId = current.activeOrganizationId
      if (!organizationId || document.visibilityState !== 'visible' || notificationRequestsInFlight.current.has(organizationId)) return
      const requestId = ++notificationRequestId.current
      notificationRequestsInFlight.current.set(organizationId, requestId)
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
      }).catch(() => { if (active && revision === notificationRefreshRevision.current) setNotificationsError(true) }).finally(() => {
        if (notificationRequestsInFlight.current.get(organizationId) === requestId) notificationRequestsInFlight.current.delete(organizationId)
        if (active && revision === notificationRefreshRevision.current) setNotificationsLoading(false)
      })
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
      clearNotificationScope()
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

  const openPlatformOrganization = async (organizationId: string): Promise<boolean> => {
    if (changingOrganization) return false
    setChangingOrganization(true)
    setOrganizationSwitchError(false)
    const previousPlatformOrganizationId = current?.platformOrganizationContext ? current.platformOrganization?.id ?? null : null
    try {
      await api.platform.accessOrganization(organizationId)
      setPlatformOrganizationContext(organizationId)
      const refreshedSession = await api.session.get()
      if (!refreshedSession.platformOrganizationContext || refreshedSession.activeOrganizationId !== organizationId) throw new Error('Company context was not authorized')
      setCurrent(refreshedSession)
      clearNotificationScope()
      navigate(pagePaths.home, { replace: true })
      return true
    } catch {
      setPlatformOrganizationContext(previousPlatformOrganizationId)
      setOrganizationSwitchError(true)
      return false
    } finally {
      setChangingOrganization(false)
    }
  }

  const returnToPlatformConsole = () => {
    clearNotificationScope()
    setPlatformOrganizationContext(null)
    navigate('/platform')
    setMobileMenuOpen(false)
    void api.session.get().then(setCurrent).catch(() => setOrganizationSwitchError(true))
  }

  const activeOrganization = current?.organizations.find((organization) => organization.id === current.activeOrganizationId) ?? current?.platformOrganization ?? null
  const toggleLocale = () => { void i18n.changeLanguage(i18n.language === 'pt-BR' ? 'en' : 'pt-BR') }
  const markAllNotificationsRead = async () => {
    if (markingNotificationsRead || unreadNotificationCount === 0) return
    const scopeRevision = notificationScopeRevision.current
    setMarkingNotificationsRead(true)
    setNotificationsActionError(false)
    try {
      await api.notifications.markAllRead()
      if (scopeRevision !== notificationScopeRevision.current) return
      notificationRefreshRevision.current += 1
      setNotifications([])
      setUnreadNotificationCount(0)
      setNotificationsError(false)
      notificationsLoadedRef.current = true
    } catch { if (scopeRevision === notificationScopeRevision.current) setNotificationsActionError(true) }
    finally { setMarkingNotificationsRead(false) }
  }
  const openNotification = async (notification: UserNotificationDto) => {
    const scopeRevision = notificationScopeRevision.current
    setNotificationOpenError(false)
    try {
      await api.notifications.markRead(notification.id)
      if (scopeRevision !== notificationScopeRevision.current) return
      notificationRefreshRevision.current += 1
      setNotifications((items) => items.filter((item) => item.id !== notification.id))
      setUnreadNotificationCount((count) => Math.max(0, count - 1))
      setNotificationsOpen(false)
      if (notification.taskId) navigateToPage('tasks', { businessLineId: null, taskId: notification.taskId })
      else if (notification.handoffId) navigateToPage('handoffs', { businessLineId: null, handoffId: notification.handoffId, status: notification.notificationType === 'handoff_returned' ? 'returned' : 'accepted' })
      else if (notification.opportunityId) navigateToPage('pipeline', { businessLineId: null, opportunityId: notification.opportunityId })
      else if (notification.channelId) navigateToPage('channels', { businessLineId: null })
      else if (notification.conversationId) navigateToPage('inbox', { businessLineId: null, conversationId: notification.conversationId })
    } catch { if (scopeRevision === notificationScopeRevision.current) setNotificationOpenError(true) }
  }

  const chooseBusinessLine = (businessLineId: string) => {
    const params = new URLSearchParams(location.search)
    if (businessLineId) params.set('businessLineId', businessLineId)
    else params.delete('businessLineId')
    navigate({ pathname: location.pathname, search: params.toString() ? `?${params}` : '' })
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
      <Suspense fallback={<WorkspaceState kind="loading" compact message={t('common.loading')} />}><LoginWorkspace onError={setError} /></Suspense>
      {error !== 'authRequired' && error && <p className="access-error" role="alert">{error}</p>}
    </section>
  </main>

  const isPlatformAdmin = current.user.platformRole === PLATFORM_ROLE.superAdmin
  const hasActiveMembership = current.activeOrganizationId !== null && current.organizations.some((organization) => organization.id === current.activeOrganizationId)
  if (isPlatformAdmin && (location.pathname === '/platform' || (!hasActiveMembership && !current.platformOrganizationContext))) return <Suspense fallback={<WorkspaceState kind="loading" compact message={t('common.loading')} />}><PlatformWorkspace user={current.user} organizations={current.organizations} activeOrganizationId={current.platformOrganizationContext ? current.platformOrganization?.id ?? null : null} activeOrganizationName={current.platformOrganizationContext ? current.platformOrganization?.name ?? '' : ''} platformOrganizationContext={current.platformOrganizationContext} onOpenOrganization={(organizationId) => void chooseOrganization(organizationId)} onSelectOrganization={openPlatformOrganization} onSignOut={async () => { setPlatformOrganizationContext(null); await api.auth.signOut(); window.location.reload() }} /></Suspense>

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
        {navigationPageGroups.daily.some(canViewPage) && <div className="nav-group" role="group" aria-label={t('common.navGroups.daily')}>
          <Button className={`nav-group-toggle ${navigationGroupForPage(page) === 'daily' ? 'current' : ''}`} aria-expanded={expandedNavigationGroup === 'daily'} aria-controls="nav-group-daily" onClick={(event) => { event.stopPropagation(); setNavigationGroupOverride({ page, group: expandedNavigationGroup === 'daily' ? null : 'daily' }) }}><span>{t('common.navGroups.daily')}</span><ChevronDown size={15} aria-hidden="true" /></Button>
          <div className="nav-group-links" id="nav-group-daily" hidden={expandedNavigationGroup !== 'daily'}>
            {canViewPage('home') && <Button className={`nav ${page === 'home' ? 'active' : ''}`} aria-current={page === 'home' ? 'page' : undefined} onClick={() => navigateToPage('home')}><CalendarClock size={18} />{t('common.home')}</Button>}
            {canViewPage('tasks') && <Button className={`nav ${page === 'tasks' ? 'active' : ''}`} aria-current={page === 'tasks' ? 'page' : undefined} onClick={() => navigateToPage('tasks')}><ListTodo size={18} />{t('common.tasksNav')}</Button>}
          </div>
        </div>}
        {navigationPageGroups.customers.some(canViewPage) && <div className="nav-group" role="group" aria-label={t('common.navGroups.customers')}>
          <Button className={`nav-group-toggle ${navigationGroupForPage(page) === 'customers' ? 'current' : ''}`} aria-expanded={expandedNavigationGroup === 'customers'} aria-controls="nav-group-customers" onClick={(event) => { event.stopPropagation(); setNavigationGroupOverride({ page, group: expandedNavigationGroup === 'customers' ? null : 'customers' }) }}><span>{t('common.navGroups.customers')}</span><ChevronDown size={15} aria-hidden="true" /></Button>
          <div className="nav-group-links" id="nav-group-customers" hidden={expandedNavigationGroup !== 'customers'}>
            {canViewPage('inbox') && <Button className={`nav ${page === 'inbox' ? 'active' : ''}`} aria-current={page === 'inbox' ? 'page' : undefined} onClick={() => navigateToPage('inbox')}><MessageSquareText size={18} />{t('common.inboxNav')}{notifications.filter((notification) => notification.notificationType === USER_NOTIFICATION_TYPE.inboxNewMessage || notification.notificationType === USER_NOTIFICATION_TYPE.conversationAssigned).length > 0 && <span className="nav-count">{notifications.filter((notification) => notification.notificationType === USER_NOTIFICATION_TYPE.inboxNewMessage || notification.notificationType === USER_NOTIFICATION_TYPE.conversationAssigned).length}</span>}</Button>}
            {canViewPage('leads') && <Button className={`nav ${page === 'leads' ? 'active' : ''}`} aria-current={page === 'leads' ? 'page' : undefined} onClick={() => navigateToPage('leads')}><Users size={18} />{t('common.leadsNav')}</Button>}
            {canViewPage('accounts') && <Button className={`nav ${page === 'accounts' ? 'active' : ''}`} aria-current={page === 'accounts' ? 'page' : undefined} onClick={() => navigateToPage('accounts')}><Building2 size={18} />{t('common.accountsNav')}</Button>}
          </div>
        </div>}
        {navigationPageGroups.sales.some(canViewPage) && <div className="nav-group" role="group" aria-label={t('common.navGroups.sales')}>
          <Button className={`nav-group-toggle ${navigationGroupForPage(page) === 'sales' ? 'current' : ''}`} aria-expanded={expandedNavigationGroup === 'sales'} aria-controls="nav-group-sales" onClick={(event) => { event.stopPropagation(); setNavigationGroupOverride({ page, group: expandedNavigationGroup === 'sales' ? null : 'sales' }) }}><span>{t('common.navGroups.sales')}</span><ChevronDown size={15} aria-hidden="true" /></Button>
          <div className="nav-group-links" id="nav-group-sales" hidden={expandedNavigationGroup !== 'sales'}>
            {canViewPage('closerQueue') && <Button className={`nav ${page === 'closerQueue' ? 'active' : ''}`} aria-current={page === 'closerQueue' ? 'page' : undefined} onClick={() => navigateToPage('closerQueue')}><Briefcase size={18} />{t('common.closerQueueNav')}</Button>}
            {canViewPage('handoffs') && <Button className={`nav ${page === 'handoffs' ? 'active' : ''}`} aria-current={page === 'handoffs' ? 'page' : undefined} onClick={() => navigateToPage('handoffs')}><UserRoundCheck size={18} />{t('common.handoffsNav')}</Button>}
            {canViewPage('pipeline') && <Button className={`nav ${page === 'pipeline' ? 'active' : ''}`} aria-current={page === 'pipeline' ? 'page' : undefined} onClick={() => navigateToPage('pipeline')}><TrendingUp size={18} />{t('common.pipelineNav')}</Button>}
          </div>
        </div>}
        {navigationPageGroups.configuration.some(canViewPage) && <div className="nav-group" role="group" aria-label={t('common.navGroups.configuration')}>
          <Button className={`nav-group-toggle ${navigationGroupForPage(page) === 'configuration' ? 'current' : ''}`} aria-expanded={expandedNavigationGroup === 'configuration'} aria-controls="nav-group-configuration" onClick={(event) => { event.stopPropagation(); setNavigationGroupOverride({ page, group: expandedNavigationGroup === 'configuration' ? null : 'configuration' }) }}><span>{t('common.navGroups.configuration')}</span><ChevronDown size={15} aria-hidden="true" /></Button>
          <div className="nav-group-links" id="nav-group-configuration" hidden={expandedNavigationGroup !== 'configuration'}>
            {canViewPage('channels') && <Button className={`nav ${page === 'channels' ? 'active' : ''}`} aria-current={page === 'channels' ? 'page' : undefined} onClick={() => navigateToPage('channels')}><Radio size={18} />{t('common.channelsNav')}</Button>}
            {canViewPage('assistant') && <Button className={`nav ${page === 'assistant' ? 'active' : ''}`} aria-current={page === 'assistant' ? 'page' : undefined} onClick={() => navigateToPage('assistant')}><Bot size={18} />{t('assistantSettings.nav')}</Button>}
            {canViewPage('closerSla') && <Button className={`nav ${page === 'closerSla' ? 'active' : ''}`} aria-current={page === 'closerSla' ? 'page' : undefined} onClick={() => navigateToPage('closerSla')}><CalendarClock size={18} />{t('closerSlaSettings.nav')}</Button>}
            {canViewPage('pipelineStages') && <Button className={`nav ${page === 'pipelineStages' ? 'active' : ''}`} aria-current={page === 'pipelineStages' ? 'page' : undefined} onClick={() => navigateToPage('pipelineStages')}><TrendingUp size={18} />{t('pipelineStageSettings.nav')}</Button>}
            {canViewPage('businessLines') && <Button className={`nav ${page === 'businessLines' ? 'active' : ''}`} aria-current={page === 'businessLines' ? 'page' : undefined} onClick={() => navigateToPage('businessLines')}><Briefcase size={18} />{t('businessLines.title')}</Button>}
          </div>
        </div>}
        {navigationPageGroups.management.some(canViewPage) || isPlatformAdmin ? <div className="nav-group" role="group" aria-label={t('common.navGroups.management')}>
          <Button className={`nav-group-toggle ${navigationGroupForPage(page) === 'management' ? 'current' : ''}`} aria-expanded={expandedNavigationGroup === 'management'} aria-controls="nav-group-management" onClick={(event) => { event.stopPropagation(); setNavigationGroupOverride({ page, group: expandedNavigationGroup === 'management' ? null : 'management' }) }}><span>{t('common.navGroups.management')}</span><ChevronDown size={15} aria-hidden="true" /></Button>
          <div className="nav-group-links" id="nav-group-management" hidden={expandedNavigationGroup !== 'management'}>
            {canViewPage('reports') && <Button className={`nav ${page === 'reports' ? 'active' : ''}`} aria-current={page === 'reports' ? 'page' : undefined} onClick={() => navigateToPage('reports')}><BarChart3 size={18} />{t('funnelReport.nav')}</Button>}
            {canViewPage('audit') && <Button className={`nav ${page === 'audit' ? 'active' : ''}`} aria-current={page === 'audit' ? 'page' : undefined} onClick={() => navigateToPage('audit')}><ShieldCheck size={18} />{t('common.auditNav')}</Button>}
            {canViewPage('imports') && <Button className={`nav ${page === 'imports' ? 'active' : ''}`} aria-current={page === 'imports' ? 'page' : undefined} onClick={() => navigateToPage('imports')}><Database size={18} />{t('common.importsNav')}</Button>}
            {canViewPage('team') && <Button className={`nav ${page === 'team' ? 'active' : ''}`} aria-current={page === 'team' ? 'page' : undefined} onClick={() => navigateToPage('team')}><Users size={18} />{t('common.teamNav')}</Button>}
            {isPlatformAdmin && <Button className="nav" type="button" onClick={returnToPlatformConsole}><ShieldCheck size={18} />{t('platform.nav')}</Button>}
          </div>
        </div> : null}
      </nav>
      <div className="rail-bottom">
        <span className="avatar">{current?.user.name.slice(0, 1) ?? 'S'}</span>
        <div><strong>{current?.user.name ?? t('common.account')}</strong><small>{current?.user.email ?? t('common.secureAccess')}</small></div>
      </div>
    </aside>
    <section className="main">
      {notificationToast && <div className={`notification-toast${notificationToast.notificationType === USER_NOTIFICATION_TYPE.messageDeliveryFailed || notificationToast.notificationType === USER_NOTIFICATION_TYPE.channelDisconnected ? ' is-error' : ''}`} role={notificationToast.notificationType === USER_NOTIFICATION_TYPE.messageDeliveryFailed || notificationToast.notificationType === USER_NOTIFICATION_TYPE.channelDisconnected ? 'alert' : 'status'}><Bell size={17} /><Button type="button" onClick={() => { void openNotification(notificationToast); setNotificationToast(null) }}><strong>{t(notificationTitleKeys[notificationToast.notificationType])}</strong><small>{notificationToast.contactName ?? notificationToast.accountName ?? notificationToast.summary}</small></Button><button type="button" aria-label={t('common.close')} onClick={() => setNotificationToast(null)}><X size={15} /></button></div>}
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
              {notificationOpenError && <WorkspaceState kind="error" compact message={t('systemNotifications.openFailed')} />}
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
            {isPlatformAdmin
              ? <Suspense fallback={<WorkspaceState kind="loading" compact message={t('common.loading')} />}><PlatformOrganizationPicker activeOrganizationId={activeOrganization.id} activeOrganizationName={activeOrganization.name} platformOrganizationContext={current.platformOrganizationContext} disabled={changingOrganization} onSelectOrganization={openPlatformOrganization} /></Suspense>
              : <div className="workspace workspace-selector"><Building2 size={16} /><select className="ui-select" aria-label={t('common.activeOrganization')} value={activeOrganization.id} disabled={changingOrganization || current.organizations.length < 2} onChange={(event) => void chooseOrganization(event.target.value)}>
                {current.organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
              </select></div>}
            {organizationSwitchError && <span className="workspace-error" role="alert">{t('errors.requestFailed')}</span>}
          </div>}
          {activeOrganization && businessLinesLoaded && businessLines.length > 0 && <div className="workspace workspace-selector business-line-global-selector"><Briefcase size={16} aria-hidden="true" /><select className="ui-select" aria-label={t('businessLines.currentLine')} value={activeBusinessLineId} onChange={(event) => chooseBusinessLine(event.target.value)}>{canViewAllBusinessLines && <option value="">{t('businessLines.allLines')}</option>}{businessLines.map((line) => <option key={line.id} value={line.id}>{line.name}</option>)}</select></div>}
          <span className="avatar small">{current?.user.name.slice(0, 1) ?? 'S'}</span>
        </div>
      </header>
      {current.platformOrganizationContext && activeOrganization && <div className="platform-context-banner" role="status"><ShieldCheck size={17} aria-hidden="true" /><span>{t('platform.contextBanner', { company: activeOrganization.name })}</span><Button type="button" onClick={returnToPlatformConsole}>{t('platform.returnToCompanies')}<ArrowRight size={14} aria-hidden="true" /></Button></div>}
      <div className="content" key={current?.activeOrganizationId ?? 'no-organization'}>
        <Breadcrumbs items={breadcrumbItems} label={t('common.breadcrumbLabel')} />
        {page === 'home' && canViewPage('businessLines') && businessLinesLoaded && !businessLinesLoadFailed && businessLines.length === 0 && <section className="business-line-first-run" aria-labelledby="business-line-first-run-title">
          <span className="business-line-first-run-icon"><Briefcase size={20} aria-hidden="true" /></span>
          <div><h2 id="business-line-first-run-title">{t(allBusinessLines.length === 0 ? 'businessLines.homeSetupTitle' : 'businessLines.homeInactiveTitle')}</h2><p>{t(allBusinessLines.length === 0 ? 'businessLines.homeSetupDescription' : 'businessLines.homeInactiveDescription')}</p></div>
          <Button type="button" onClick={() => navigateToPage('businessLines')}>{t(allBusinessLines.length === 0 ? 'businessLines.homeSetupAction' : 'businessLines.homeInactiveAction')}<ArrowRight size={15} aria-hidden="true" /></Button>
        </section>}
        <Suspense fallback={<WorkspaceState kind="loading" compact message={t('common.loading')} />}>
        {page === 'closerSla' ? <CloserSlaSettingsWorkspace />
          : page === 'pipelineStages' ? <PipelineStagesWorkspace onBack={() => navigateToPage('pipeline')} />
          : page === 'team' && current?.activeOrganizationId ? <TeamSettings organizationId={current.activeOrganizationId} />
          : page === 'businessLines' && current?.activeOrganizationId ? <BusinessLinesWorkspace organizationId={current.activeOrganizationId} />
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
        </Suspense>
      </div>
    </section>
  </main>
}
