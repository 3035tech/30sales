import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './index.css'
import './lib/i18n'
import App from './App.tsx'
import { AcceptInvitation } from './features/AcceptInvitation'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {window.location.pathname === '/accept-invitation' ? <AcceptInvitation /> : <HashRouter><App /></HashRouter>}
  </StrictMode>,
)
