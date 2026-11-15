import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, BarChart3, Bell, Building2, ChevronDown, Command, ListTodo, MessageSquareText, TrendingUp, UserRoundCheck, Users, ShieldCheck, Database, CalendarClock, Briefcase, Radio, Bot, Menu, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { WorkspaceState } from './components/ui/WorkspaceState'
import { api, type SessionDto, type UserNotificationDto } from './lib/api/client'
import i18n from './lib/i18n'
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
import './App.css'

type Page = 'home' | 'closerQueue' | 'closerSla' | 'inbox' | 'leads' | 'accounts' | 'channels' | 'assistant' | 'tasks' | 'handoffs' | 'pipeline' | 'reports' | 'audit' | 'imports' | 'team'
const pagePaths: Record<Page, string> = {
  home: '/today', closerQueue: '/closer', closerSla: '/settings/closer-sla', inbox: '/inbox', leads: '/leads',
  accounts: '/accounts', channels: '/settings/channels', assistant: '/settings/assistant', tasks: '/tasks',
  handoffs: '/handoffs', pipeline: '/pipeline', reports: '/reports/funnel', audit: '/settings/audit',
  imports: '/settings/imports', team: '/settings/team',
}
const pagesByPath = Object.fromEntries(Object.entries(pagePaths).map(([page, path]) => [path, page])) as Record<string, Page>
const pageTranslationKeys: Record<Page, string> = {
  home: 'today', closerQueue: 'closerQueue', closerSla: 'closerSlaSettings', inbox: 'inbox', leads: 'leads',
  accounts: 'accounts', channels: 'channels', assistant: 'assistantSettings', tasks: 'tasks', handoffs: 'handoffs',
  pipeline: 'pipeline', reports: 'funnelReport', audit: 'audit', imports: 'imports', team: 'team',
}

export default function App() {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const [current, setCurrent] = useState<SessionDto | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const page = pagesByPath[location.pathname] ?? 'home'
  const searchParams = new URLSearchParams(location.search)
  const leadSearchSeed = page === 'leads' ? searchParams.get('search') ?? '' : ''
  const inboxSearchSeed = page === 'inbox' ? searchParams.get('search') ?? '' : ''
  const inboxConversationSeed = page === 'inbox' ? searchParams.get('conversationId') ?? '' : ''
  const [notifications, setNotifications] = useState<UserNotificationDto[]>([])
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notificationsError, setNotificationsError] = useState(false)
  const [notificationsLoading, setNotificationsLoading] = useState(false)
  const notificationsLoadedRef = useRef(false)
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
    api.session.get().then(setCurrent).catch(() => setError('authRequired')).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!pagesByPath[location.pathname]) navigate(pagePaths.home, { replace: true })
  }, [location.pathname, navigate])

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
      if (!notificationsLoadedRef.current) setNotificationsLoading(true)
      api.notifications.list().then((page) => {
        if (active) { setNotifications(page.data); setUnreadNotificationCount(page.unreadCount); setNotificationsError(false); notificationsLoadedRef.current = true }
      }).catch(() => { if (active) setNotificationsError(true) }).finally(() => { if (active) setNotificationsLoading(false) })
    }
    refresh()
    const interval = window.setInterval(refresh, 30_000)
    document.addEventListener('visibilitychange', refresh)
    return () => { active = false; window.clearInterval(interval); document.removeEventListener('visibilitychange', refresh) }
  }, [current?.activeOrganizationId])

  const chooseOrganization = async (organizationId: string) => {
    if (organizationId === current?.activeOrganizationId || changingOrganization) return
    setChangingOrganization(true)
    setOrganizationSwitchError(false)
    try {
      const result = await api.auth.setActiveOrganization(organizationId)
      if (result.error) throw new Error('Organization switch failed')
      setCurrent((previous) => previous ? { ...previous, activeOrganizationId: organizationId } : previous)
      setNotifications([])
      setUnreadNotificationCount(0)
      notificationsLoadedRef.current = false
      navigateToPage('home', {}, { replace: true })
      setMobileMenuOpen(false)
    } catch {
      setOrganizationSwitchError(true)
    } finally {
      setChangingOrganization(false)
    }
  }

  const activeOrganization = current?.organizations.find((organization) => organization.id === current.activeOrganizationId)
  const toggleLocale = () => { void i18n.changeLanguage(i18n.language === 'pt-BR' ? 'en' : 'pt-BR') }
  const openNotification = async (notification: UserNotificationDto) => {
    try {
      await api.notifications.markRead(notification.id)
      setNotifications((items) => items.filter((item) => item.id !== notification.id))
      setUnreadNotificationCount((count) => Math.max(0, count - 1))
      setNotificationsOpen(false)
      if (notification.taskId) navigateToPage('tasks', { taskId: notification.taskId })
      else if (notification.handoffId) navigateToPage('handoffs', { handoffId: notification.handoffId, status: notification.notificationType === 'handoff_returned' ? 'returned' : 'accepted' })
      else if (notification.conversationId) navigateToPage('inbox', { conversationId: notification.conversationId })
    } catch { setNotificationsError(true) }
  }

  return <main className="shell">
    <aside className="rail">
      <div className="brand"><img className="brand-wordmark" src="/brand-kit/logos/logo-default.svg" alt="30Sales" /></div>
      <button className="mobile-nav-toggle" type="button" aria-label={t(mobileMenuOpen ? 'common.closeNavigation' : 'common.openNavigation')} aria-controls="primary-navigation" aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen((open) => !open)}>
        {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
      </button>
      <nav id="primary-navigation" className={`nav-items ${mobileMenuOpen ? 'open' : ''}`} aria-label={t('common.workspace')} onClick={() => setMobileMenuOpen(false)}>
        <div className="nav-group" role="group" aria-label={t('common.navGroups.daily')}><span className="nav-group-title">{t('common.navGroups.daily')}</span>
          <button className={`nav ${page === 'home' ? 'active' : ''}`} aria-current={page === 'home' ? 'page' : undefined} onClick={() => navigateToPage('home')}><CalendarClock size={18} />{t('common.home')}</button>
          <button className={`nav ${page === 'tasks' ? 'active' : ''}`} aria-current={page === 'tasks' ? 'page' : undefined} onClick={() => navigateToPage('tasks')}><ListTodo size={18} />{t('common.tasksNav')}</button>
        </div>
        <div className="nav-group" role="group" aria-label={t('common.navGroups.customers')}><span className="nav-group-title">{t('common.navGroups.customers')}</span>
          <button className={`nav ${page === 'inbox' ? 'active' : ''}`} aria-current={page === 'inbox' ? 'page' : undefined} onClick={() => navigateToPage('inbox')}><MessageSquareText size={18} />{t('common.inboxNav')}</button>
          <button className={`nav ${page === 'leads' ? 'active' : ''}`} aria-current={page === 'leads' ? 'page' : undefined} onClick={() => navigateToPage('leads')}><Users size={18} />{t('common.leadsNav')}</button>
          <button className={`nav ${page === 'accounts' ? 'active' : ''}`} aria-current={page === 'accounts' ? 'page' : undefined} onClick={() => navigateToPage('accounts')}><Building2 size={18} />{t('common.accountsNav')}</button>
        </div>
        <div className="nav-group" role="group" aria-label={t('common.navGroups.sales')}><span className="nav-group-title">{t('common.navGroups.sales')}</span>
          <button className={`nav ${page === 'closerQueue' ? 'active' : ''}`} aria-current={page === 'closerQueue' ? 'page' : undefined} onClick={() => navigateToPage('closerQueue')}><Briefcase size={18} />{t('common.closerQueueNav')}</button>
          <button className={`nav ${page === 'handoffs' ? 'active' : ''}`} aria-current={page === 'handoffs' ? 'page' : undefined} onClick={() => navigateToPage('handoffs')}><UserRoundCheck size={18} />{t('common.handoffsNav')}</button>
          <button className={`nav ${page === 'pipeline' ? 'active' : ''}`} aria-current={page === 'pipeline' ? 'page' : undefined} onClick={() => navigateToPage('pipeline')}><TrendingUp size={18} />{t('common.pipelineNav')}</button>
        </div>
        <div className="nav-group" role="group" aria-label={t('common.navGroups.management')}><span className="nav-group-title">{t('common.navGroups.management')}</span>
          <button className={`nav ${page === 'channels' ? 'active' : ''}`} aria-current={page === 'channels' ? 'page' : undefined} onClick={() => navigateToPage('channels')}><Radio size={18} />{t('common.channelsNav')}</button>
          <button className={`nav ${page === 'assistant' ? 'active' : ''}`} aria-current={page === 'assistant' ? 'page' : undefined} onClick={() => navigateToPage('assistant')}><Bot size={18} />{t('assistantSettings.nav')}</button>
          <button className={`nav ${page === 'closerSla' ? 'active' : ''}`} aria-current={page === 'closerSla' ? 'page' : undefined} onClick={() => navigateToPage('closerSla')}><CalendarClock size={18} />{t('closerSlaSettings.nav')}</button>
          <button className={`nav ${page === 'reports' ? 'active' : ''}`} aria-current={page === 'reports' ? 'page' : undefined} onClick={() => navigateToPage('reports')}><BarChart3 size={18} />{t('funnelReport.nav')}</button>
          <button className={`nav ${page === 'audit' ? 'active' : ''}`} aria-current={page === 'audit' ? 'page' : undefined} onClick={() => navigateToPage('audit')}><ShieldCheck size={18} />{t('common.auditNav')}</button>
          <button className={`nav ${page === 'imports' ? 'active' : ''}`} aria-current={page === 'imports' ? 'page' : undefined} onClick={() => navigateToPage('imports')}><Database size={18} />{t('common.importsNav')}</button>
          <button className={`nav ${page === 'team' ? 'active' : ''}`} aria-current={page === 'team' ? 'page' : undefined} onClick={() => navigateToPage('team')}><Users size={18} />{t('common.teamNav')}</button>
        </div>
      </nav>
      <div className="rail-bottom">
        <span className="avatar">{current?.user.name.slice(0, 1) ?? 'S'}</span>
        <div><strong>{current?.user.name ?? t('common.account')}</strong><small>{current?.user.email ?? t('common.secureAccess')}</small></div>
      </div>
    </aside>
    <section className="main">
      <header>
        <div><span className="eyebrow">{t(`${pageTranslationKeys[page]}.eyebrow`)}</span><h1>{t(`${pageTranslationKeys[page]}.title`)}</h1></div>
        <div className="account">
          <button className="language-toggle" onClick={toggleLocale} aria-label={t('common.languageToggleLabel')}>{i18n.language === 'pt-BR' ? 'EN' : 'PT'}</button>
          {current?.activeOrganizationId && <div className="notification-menu">
            <button className="notification-trigger" type="button" aria-label={t('systemNotifications.open', { count: unreadNotificationCount })} aria-expanded={notificationsOpen} onClick={() => setNotificationsOpen((open) => !open)}>
              <Bell size={18} />{unreadNotificationCount > 0 && <span className="notification-count">{unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}</span>}
            </button>
            {notificationsOpen && <section className="notification-panel" aria-label={t('systemNotifications.title')}>
              <div className="notification-panel-heading"><strong>{t('systemNotifications.title')}</strong><span>{t('systemNotifications.unread', { count: unreadNotificationCount })}</span></div>
              {notificationsError && notifications.length > 0 && <WorkspaceState kind="error" compact message={t('systemNotifications.loadFailed')} detail={t('table.resultsRetained')} />}
              {notificationsLoading && notifications.length === 0 ? <WorkspaceState kind="loading" compact message={t('common.loading')} /> : notifications.length === 0 ? notificationsError ? <WorkspaceState kind="error" compact message={t('systemNotifications.loadFailed')} /> : <WorkspaceState kind="empty" compact message={t('systemNotifications.empty')} /> : notifications.map((notification) => <button className="notification-item" key={notification.id} type="button" onClick={() => void openNotification(notification)}>
                <span className={`notification-item-title${notification.notificationType === 'inbox_new_message' ? ' is-inbox' : ''}`}>{notification.notificationType === 'inbox_new_message' ? t('systemNotifications.newMessage') : notification.notificationType === 'task_overdue' ? t('systemNotifications.taskOverdue') : notification.notificationType === 'handoff_accepted' ? t('systemNotifications.handoffAccepted') : notification.notificationType === 'handoff_returned' ? t('systemNotifications.handoffReturned') : t(`closerSlaSettings.notifications.${notification.notificationType === 'closer_event_sla_escalated' ? 'escalated' : 'overdue'}`)}</span>
                <span>{notification.notificationType === 'inbox_new_message' ? [notification.contactName, notification.accountName].filter(Boolean).join(' · ') || notification.summary : notification.notificationType === 'task_overdue' ? [notification.taskTitle, notification.contactName, notification.accountName].filter(Boolean).join(' · ') || notification.summary : notification.handoffId ? [notification.contactName, notification.accountName, notification.summary].filter(Boolean).join(' · ') : notification.accountName ?? notification.summary}</span>
                <small>{notification.eventType ? `${t(`closerEventTypes.${notification.eventType}`)} · ` : ''}{new Intl.DateTimeFormat(i18n.language, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(notification.dueAt ?? notification.createdAt))}</small>
                <span className="notification-open">{notification.taskId ? t('systemNotifications.openTask') : notification.handoffId ? t('systemNotifications.openHandoff') : t('systemNotifications.openConversation')} <ArrowRight size={13} /></span>
              </button>)}
            </section>}
          </div>}
          {activeOrganization && <div className="workspace-selector-wrap">
            <div className="workspace workspace-selector"><Building2 size={16} /><select aria-label={t('common.activeOrganization')} value={activeOrganization.id} disabled={changingOrganization || (current?.organizations.length ?? 0) < 2} onChange={(event) => void chooseOrganization(event.target.value)}>
              {current?.organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
            </select><ChevronDown size={15} aria-hidden="true" /></div>
            {organizationSwitchError && <span className="workspace-error" role="alert">{t('errors.requestFailed')}</span>}
          </div>}
          <span className="avatar small">{current?.user.name.slice(0, 1) ?? 'S'}</span>
        </div>
      </header>
      <div className="content" key={current?.activeOrganizationId ?? 'no-organization'}>
        {loading ? <div className="notice">{t('common.loading')}</div> : error ? <section className="welcome">
          <span className="welcome-icon"><Command size={24} /></span><p className="eyebrow">{t('home.accessEyebrow')}</p><h2>{t('home.signInTitle')}</h2>
          <p className="muted">{t('home.signInHint')}</p><Login onError={setError} />{error !== 'authRequired' && <p className="error">{error}</p>}
        </section> : current && !current.activeOrganizationId ? <section className="welcome">
          <span className="welcome-icon"><Building2 size={24} /></span><p className="eyebrow">{t('home.chooseEyebrow')}</p><h2>{t('home.chooseTitle')}</h2><p className="muted">{t('home.chooseHint')}</p>
          <div className="org-list">{current.organizations.map((organization) => <button key={organization.id} onClick={() => void chooseOrganization(organization.id)}><Building2 size={18} /><span>{organization.name}<small>{organization.slug}</small></span><ArrowRight size={17} /></button>)}</div>
        </section> : page === 'closerSla' && current?.activeOrganizationId ? <CloserSlaSettingsWorkspace />
          : page === 'team' && current?.activeOrganizationId ? <TeamSettings organizationId={current.activeOrganizationId} />
          : page === 'closerQueue' && current?.activeOrganizationId ? <CloserQueueWorkspace userId={current.user.id} onOpenPipeline={() => navigateToPage('pipeline')} onOpenInbox={(conversationId) => navigateToPage('inbox', { conversationId })} />
          : page === 'channels' && current?.activeOrganizationId ? <ChannelsWorkspace />
          : page === 'assistant' && current?.activeOrganizationId ? <AssistantSettingsWorkspace />
          : page === 'inbox' && current?.activeOrganizationId ? <InboxWorkspace initialSearch={inboxSearchSeed} initialConversationId={inboxConversationSeed} />
          : page === 'leads' && current?.activeOrganizationId ? <LeadsWorkspace initialSearch={leadSearchSeed} />
          : page === 'accounts' && current?.activeOrganizationId ? <AccountsWorkspace onOpenLeads={(name) => navigateToPage('leads', { search: name })} />
            : page === 'tasks' && current?.activeOrganizationId ? <TasksWorkspace />
            : page === 'handoffs' && current?.activeOrganizationId ? <HandoffsWorkspace />
              : page === 'pipeline' && current?.activeOrganizationId ? <PipelineWorkspace />
              : page === 'reports' && current?.activeOrganizationId ? <FunnelReportWorkspace />
                : page === 'audit' && current?.activeOrganizationId ? <AuditWorkspace />
                  : page === 'imports' && current?.activeOrganizationId ? <ImportsWorkspace />
            : <TodayWorkspace userId={current?.user.id ?? ''} navigate={navigateToPage} />}
      </div>
    </section>
  </main>
}

function Login({ onError }: { onError: (message: string) => void }) {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    onError('')
    const result = await api.auth.signInEmail({ email, password })
    setBusy(false)
    if (result.error) onError(t('auth.failedSignIn'))
    else window.location.reload()
  }
  return <form className="login-form" onSubmit={submit}>
    <label>{t('common.email')}<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
    <label>{t('auth.password')}<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
    <button className="primary" disabled={busy}>{busy ? t('auth.signingIn') : t('auth.signIn')}<ArrowRight size={16} /></button>
  </form>
}
