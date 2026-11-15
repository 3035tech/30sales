import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './index.css'
import './lib/i18n'
import App from './App.tsx'
import { AcceptInvitation } from './features/AcceptInvitation'
import { ResetPassword } from './features/ResetPassword'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {window.location.pathname === '/accept-invitation' ? <AcceptInvitation /> : window.location.pathname === '/reset-password' ? <ResetPassword /> : <HashRouter><App /></HashRouter>}
  </StrictMode>,
)
