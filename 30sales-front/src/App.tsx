import { useEffect, useState } from 'react'
import { ArrowRight, Building2, Check, ChevronDown, Command, Layers3, ListTodo, MessageSquareText, TrendingUp, UserRoundCheck, Users, ShieldCheck } from 'lucide-react'
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
import './App.css'

type Page = 'home' | 'inbox' | 'leads' | 'tasks' | 'handoffs' | 'pipeline' | 'audit' | 'team'

export default function App() {
  const { t } = useTranslation()
  const [current, setCurrent] = useState<SessionDto | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState<Page>('home')

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
      <button className={`nav ${page === 'home' ? 'active' : ''}`} onClick={() => setPage('home')}><Layers3 size={18} />{t('common.home')}</button>
      <button className={`nav ${page === 'inbox' ? 'active' : ''}`} onClick={() => setPage('inbox')}><MessageSquareText size={18} />{t('common.inboxNav')}</button>
      <button className={`nav ${page === 'leads' ? 'active' : ''}`} onClick={() => setPage('leads')}><Users size={18} />{t('common.leadsNav')}</button>
      <button className={`nav ${page === 'tasks' ? 'active' : ''}`} onClick={() => setPage('tasks')}><ListTodo size={18} />{t('common.tasksNav')}</button>
      <button className={`nav ${page === 'handoffs' ? 'active' : ''}`} onClick={() => setPage('handoffs')}><UserRoundCheck size={18} />{t('common.handoffsNav')}</button>
      <button className={`nav ${page === 'pipeline' ? 'active' : ''}`} onClick={() => setPage('pipeline')}><TrendingUp size={18} />{t('common.pipelineNav')}</button>
      <button className={`nav ${page === 'audit' ? 'active' : ''}`} onClick={() => setPage('audit')}><ShieldCheck size={18} />{t('common.auditNav')}</button>
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
        </section> : page === 'team' && current?.activeOrganizationId ? <TeamSettings organizationId={current.activeOrganizationId} />
          : page === 'inbox' && current?.activeOrganizationId ? <InboxWorkspace />
          : page === 'leads' && current?.activeOrganizationId ? <LeadsWorkspace />
            : page === 'tasks' && current?.activeOrganizationId ? <TasksWorkspace />
            : page === 'handoffs' && current?.activeOrganizationId ? <HandoffsWorkspace />
              : page === 'pipeline' && current?.activeOrganizationId ? <PipelineWorkspace />
                : page === 'audit' && current?.activeOrganizationId ? <AuditWorkspace />
            : <HomeContent />}
      </div>
    </section>
  </main>
}

function HomeContent() {
  const { t } = useTranslation()
  return <>
    <div className="welcome compact"><span className="welcome-icon success"><Check size={23} /></span><div><p className="eyebrow">{t('home.welcomeEyebrow')}</p><h2>{t('home.welcomeTitle')}</h2><p className="muted">{t('home.welcomeHint')}</p></div></div>
    <div className="section-head"><div><p className="eyebrow">{t('home.gettingStarted')}</p><h2>{t('home.prepare')}</h2></div><span className="tag">{t('home.phase')}</span></div>
    <div className="cards">
      <Card icon={<Users size={19} />} number="01" title={t('home.inviteTitle')} text={t('home.inviteText')} />
      <Card icon={<Layers3 size={19} />} number="02" title={t('home.leadsTitle')} text={t('home.leadsText')} />
      <Card icon={<Building2 size={19} />} number="03" title={t('home.integrationsTitle')} text={t('home.integrationsText')} />
    </div>
    <div className="footer-note"><span className="dot" />{t('home.tenantNote')}</div>
  </>
}

function Card({ icon, number, title, text }: { icon: React.ReactNode; number: string; title: string; text: string }) {
  const { t } = useTranslation()
  return <article><span className="card-icon">{icon}</span><span className="card-count">{number}</span><h3>{title}</h3><p>{text}</p><button disabled>{t('home.comingSoon')}<ArrowRight size={15} /></button></article>
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
