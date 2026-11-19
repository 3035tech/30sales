import { lazy } from 'react'
import i18n from './lib/i18n'

export const AcceptInvitationRoute = lazy(() => import('./features/AcceptInvitation').then((module) => ({ default: module.AcceptInvitation })))
export const ResetPasswordRoute = lazy(() => import('./features/ResetPassword').then((module) => ({ default: module.ResetPassword })))

export function RouteLoading() {
  return <main className="access-shell"><section className="access-card" role="status" aria-live="polite">{i18n.t('common.loading')}</section></main>
}
