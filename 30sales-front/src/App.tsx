import { useEffect, useState } from 'react'
import { ArrowRight, BarChart3, Building2, ChevronDown, Command, ListTodo, MessageSquareText, TrendingUp, UserRoundCheck, Users, ShieldCheck, Database, CalendarClock, Briefcase, Radio, Bot } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { api, type SessionDto } from './lib/api/client'
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

export default function App() {
  const { t } = useTranslation()
  const [current, setCurrent] = useState<SessionDto | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState<Page>('home')
  const [leadSearchSeed, setLeadSearchSeed] = useState('')
  const [inboxSearchSeed, setInboxSearchSeed] = useState('')
  const [inboxConversationSeed, setInboxConversationSeed] = useState('')

  useEffect(() => {
    api.session.get().then(setCurrent).catch(() => setError('authRequired')).finally(() => setLoading(false))
  }, [])

  const chooseOrganization = async (organizationId: string) => {
    const result = await api.auth.setActiveOrganization(organizationId)
    if (result.error) {
      setError(t('errors.requestFailed'))
      return
    }
    setCurrent((previous) => previous ? { ...previous, activeOrganizationId: organizationId } : previous)
  }

  const activeOrganization = current?.organizations.find((organization) => organization.id === current.activeOrganizationId)
  const toggleLocale = () => { void i18n.changeLanguage(i18n.language === 'pt-BR' ? 'en' : 'pt-BR') }

  return <main className="shell">
    <aside className="rail">
      <div className="brand"><img className="brand-wordmark" src="/brand-kit/logos/logo-default.svg" alt="30Sales" /></div>
      <div className="rail-caption">{t('common.workspace')}</div>
      <button className={`nav ${page === 'home' ? 'active' : ''}`} onClick={() => setPage('home')}><CalendarClock size={18} />{t('common.home')}</button>
      <button className={`nav ${page === 'closerQueue' ? 'active' : ''}`} onClick={() => setPage('closerQueue')}><Briefcase size={18} />{t('common.closerQueueNav')}</button>
      <button className={`nav ${page === 'closerSla' ? 'active' : ''}`} onClick={() => setPage('closerSla')}><CalendarClock size={18} />{t('closerSlaSettings.nav')}</button>
      <button className={`nav ${page === 'inbox' ? 'active' : ''}`} onClick={() => { setInboxSearchSeed(''); setInboxConversationSeed(''); setPage('inbox') }}><MessageSquareText size={18} />{t('common.inboxNav')}</button>
      <button className={`nav ${page === 'leads' ? 'active' : ''}`} onClick={() => { setLeadSearchSeed(''); setPage('leads') }}><Users size={18} />{t('common.leadsNav')}</button>
      <button className={`nav ${page === 'accounts' ? 'active' : ''}`} onClick={() => setPage('accounts')}><Building2 size={18} />{t('common.accountsNav')}</button>
      <button className={`nav ${page === 'channels' ? 'active' : ''}`} onClick={() => setPage('channels')}><Radio size={18} />{t('common.channelsNav')}</button>
      <button className={`nav ${page === 'assistant' ? 'active' : ''}`} onClick={() => setPage('assistant')}><Bot size={18} />{t('assistantSettings.nav')}</button>
      <button className={`nav ${page === 'tasks' ? 'active' : ''}`} onClick={() => setPage('tasks')}><ListTodo size={18} />{t('common.tasksNav')}</button>
      <button className={`nav ${page === 'handoffs' ? 'active' : ''}`} onClick={() => setPage('handoffs')}><UserRoundCheck size={18} />{t('common.handoffsNav')}</button>
      <button className={`nav ${page === 'pipeline' ? 'active' : ''}`} onClick={() => setPage('pipeline')}><TrendingUp size={18} />{t('common.pipelineNav')}</button>
      <button className={`nav ${page === 'reports' ? 'active' : ''}`} onClick={() => setPage('reports')}><BarChart3 size={18} />{t('funnelReport.nav')}</button>
      <button className={`nav ${page === 'audit' ? 'active' : ''}`} onClick={() => setPage('audit')}><ShieldCheck size={18} />{t('common.auditNav')}</button>
      <button className={`nav ${page === 'imports' ? 'active' : ''}`} onClick={() => setPage('imports')}><Database size={18} />{t('common.importsNav')}</button>
      <button className={`nav ${page === 'team' ? 'active' : ''}`} onClick={() => setPage('team')}><Users size={18} />{t('common.teamNav')}</button>
      <div className="rail-bottom">
        <span className="avatar">{current?.user.name.slice(0, 1) ?? 'S'}</span>
        <div><strong>{current?.user.name ?? t('common.account')}</strong><small>{current?.user.email ?? t('common.secureAccess')}</small></div>
      </div>
    </aside>
    <section className="main">
      <header>
        <div><span className="eyebrow">{t('home.eyebrow')}</span><h1>{t('home.headline')}</h1></div>
        <div className="account">
          <button className="language-toggle" onClick={toggleLocale} aria-label={t('common.languageToggleLabel')}>{i18n.language === 'pt-BR' ? 'EN' : 'PT'}</button>
          {activeOrganization && <button className="workspace"><Building2 size={16} />{activeOrganization.name}<ChevronDown size={15} /></button>}
          <span className="avatar small">{current?.user.name.slice(0, 1) ?? 'S'}</span>
        </div>
      </header>
      <div className="content">
        {loading ? <div className="notice">{t('common.loading')}</div> : error ? <section className="welcome">
          <span className="welcome-icon"><Command size={24} /></span><p className="eyebrow">{t('home.accessEyebrow')}</p><h2>{t('home.signInTitle')}</h2>
          <p className="muted">{t('home.signInHint')}</p><Login onError={setError} />{error !== 'authRequired' && <p className="error">{error}</p>}
        </section> : current && !current.activeOrganizationId ? <section className="welcome">
          <span className="welcome-icon"><Building2 size={24} /></span><p className="eyebrow">{t('home.chooseEyebrow')}</p><h2>{t('home.chooseTitle')}</h2><p className="muted">{t('home.chooseHint')}</p>
          <div className="org-list">{current.organizations.map((organization) => <button key={organization.id} onClick={() => void chooseOrganization(organization.id)}><Building2 size={18} /><span>{organization.name}<small>{organization.slug}</small></span><ArrowRight size={17} /></button>)}</div>
        </section> : page === 'closerSla' && current?.activeOrganizationId ? <CloserSlaSettingsWorkspace />
          : page === 'team' && current?.activeOrganizationId ? <TeamSettings organizationId={current.activeOrganizationId} />
          : page === 'closerQueue' && current?.activeOrganizationId ? <CloserQueueWorkspace userId={current.user.id} onOpenPipeline={() => setPage('pipeline')} onOpenInbox={(conversationId) => { setInboxConversationSeed(conversationId); setInboxSearchSeed(''); setPage('inbox') }} />
          : page === 'channels' && current?.activeOrganizationId ? <ChannelsWorkspace />
          : page === 'assistant' && current?.activeOrganizationId ? <AssistantSettingsWorkspace />
          : page === 'inbox' && current?.activeOrganizationId ? <InboxWorkspace initialSearch={inboxSearchSeed} initialConversationId={inboxConversationSeed} />
          : page === 'leads' && current?.activeOrganizationId ? <LeadsWorkspace initialSearch={leadSearchSeed} />
          : page === 'accounts' && current?.activeOrganizationId ? <AccountsWorkspace onOpenLeads={(name) => { setLeadSearchSeed(name); setPage('leads') }} />
            : page === 'tasks' && current?.activeOrganizationId ? <TasksWorkspace />
            : page === 'handoffs' && current?.activeOrganizationId ? <HandoffsWorkspace />
              : page === 'pipeline' && current?.activeOrganizationId ? <PipelineWorkspace />
              : page === 'reports' && current?.activeOrganizationId ? <FunnelReportWorkspace />
                : page === 'audit' && current?.activeOrganizationId ? <AuditWorkspace />
                  : page === 'imports' && current?.activeOrganizationId ? <ImportsWorkspace />
            : <TodayWorkspace userId={current?.user.id ?? ''} navigate={setPage} />}
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
