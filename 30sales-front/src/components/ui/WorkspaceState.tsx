import type { ReactNode } from 'react'
import { AlertCircle, Inbox, LoaderCircle, RefreshCw, TriangleAlert } from 'lucide-react'
import './WorkspaceState.css'

export type WorkspaceStateKind = 'loading' | 'error' | 'empty' | 'partial' | 'stale'

const icons = {
  loading: LoaderCircle,
  error: AlertCircle,
  empty: Inbox,
  partial: TriangleAlert,
  stale: RefreshCw,
} satisfies Record<WorkspaceStateKind, typeof LoaderCircle>

export function WorkspaceState({ kind, message, detail, children, compact = false, showIcon = true }: {
  kind: WorkspaceStateKind
  message?: string
  detail?: string
  children?: ReactNode
  compact?: boolean
  showIcon?: boolean
}) {
  const Icon = icons[kind]
  return <div className={`workspace-state workspace-state-${kind}${compact ? ' compact' : ''}`} role={kind === 'error' ? 'alert' : 'status'} aria-live={kind === 'error' ? 'assertive' : 'polite'} aria-atomic="true">
    {showIcon && <span className="workspace-state-icon" aria-hidden="true">{<Icon size={compact ? 16 : 19} />}</span>}
    <div className="workspace-state-content">
      {message && <strong>{message}</strong>}
      {detail && <p>{detail}</p>}
      {children}
    </div>
  </div>
}
