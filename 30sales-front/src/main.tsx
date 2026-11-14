import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './lib/i18n'
import App from './App.tsx'
import { AcceptInvitation } from './features/AcceptInvitation'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {window.location.pathname === '/accept-invitation' ? <AcceptInvitation /> : <App />}
  </StrictMode>,
)
