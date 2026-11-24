import { StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './index.css'
import './lib/i18n'
import App from './App.tsx'
import { AcceptInvitationRoute, ResetPasswordRoute, RouteLoading } from './RouteEntrypoints'
import { AppLoadErrorBoundary } from './components/ui/AppLoadErrorBoundary'
import { SystemAlertViewport } from './components/ui/SystemAlert'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppLoadErrorBoundary>
      <>
        {window.location.pathname === '/accept-invitation'
          ? <Suspense fallback={<RouteLoading />}><AcceptInvitationRoute /></Suspense>
          : window.location.pathname === '/reset-password'
            ? <Suspense fallback={<RouteLoading />}><ResetPasswordRoute /></Suspense>
            : <HashRouter><App /></HashRouter>}
        <SystemAlertViewport />
      </>
    </AppLoadErrorBoundary>
  </StrictMode>,
)
