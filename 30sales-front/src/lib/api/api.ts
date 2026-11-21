type LazyDomain<T extends object> = T

function lazyDomain<T extends object>(load: () => Promise<T>): LazyDomain<T> {
  let domain: Promise<T> | undefined
  const member = (path: PropertyKey[]): (...args: unknown[]) => Promise<unknown> => {
    const invoke = (...args: unknown[]) => {
      if (!domain) {
        const loading = load()
        domain = loading
        void loading.catch(() => { if (domain === loading) domain = undefined })
      }
      return domain.then((loaded) => {
        let owner: object | Function = loaded
        for (const segment of path.slice(0, -1)) {
          const value: unknown = Reflect.get(owner, segment)
          if ((typeof value !== 'object' || value === null) && typeof value !== 'function') {
            throw new TypeError('API domain path is not available')
          }
          owner = value
        }
        const method: unknown = Reflect.get(owner, path[path.length - 1])
        if (typeof method !== 'function') throw new TypeError('API domain member is not callable')
        return Reflect.apply(method, owner, args)
      })
    }
    return new Proxy(invoke, {
      get(_target, property) { return member([...path, property]) },
    })
  }

  return new Proxy({} as T, {
    get(_target, property) { return member([property]) },
  })
}

const identityDomain = () => import('./domains/identity').then(({ authApi, teamApi }) => ({ auth: authApi, team: teamApi }))

export const api = {
  campaigns: lazyDomain(() => import('./domains/campaigns').then((module) => module.campaignsApi)),
  session: lazyDomain(() => import('./domains/session').then((module) => module.sessionApi)),
  notifications: lazyDomain(() => import('./domains/notifications').then((module) => module.notificationsApi)),
  closerEvents: lazyDomain(() => import('./domains/closerEvents').then((module) => module.closerEventsApi)),
  inbox: lazyDomain(() => import('./domains/inbox').then((module) => module.inboxApi)),
  agents: lazyDomain(() => import('./domains/agents').then((module) => module.agentsApi)),
  channels: lazyDomain(() => import('./domains/channels').then((module) => module.channelsApi)),
  audit: lazyDomain(() => import('./domains/audit').then((module) => module.auditApi)),
  imports: lazyDomain(() => import('./domains/imports').then((module) => module.importsApi)),
  leads: lazyDomain(() => import('./domains/leads').then((module) => module.leadsApi)),
  accounts: lazyDomain(() => import('./domains/accounts').then((module) => module.accountsApi)),
  tasks: lazyDomain(() => import('./domains/tasks').then((module) => module.tasksApi)),
  handoffs: lazyDomain(() => import('./domains/handoffs').then((module) => module.handoffsApi)),
  opportunities: lazyDomain(() => import('./domains/opportunities').then((module) => module.opportunitiesApi)),
  reports: lazyDomain(() => import('./domains/reports').then((module) => module.reportsApi)),
  ...lazyIdentityDomains(),
  platform: lazyDomain(() => import('./domains/platform').then((module) => module.platformApi)),
  businessLines: lazyDomain(() => import('./domains/businessLines').then((module) => module.businessLinesApi)),
}

function lazyIdentityDomains() {
  return {
    team: lazyDomain(() => identityDomain().then((module) => module.team)),
    auth: lazyDomain(() => identityDomain().then((module) => module.auth)),
  }
}
